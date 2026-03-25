import fs from 'node:fs/promises';
import path from 'node:path';

interface RepoFileState {
  sizeBytes: number;
  lastWriteMs: number;
}

export interface RepoMutationGuardOptions {
  ignoredPaths?: string[] | undefined;
}

export class RepoMutationGuard {
  private constructor(
    private readonly repoPath: string,
    private readonly before: Map<string, RepoFileState>,
    private readonly ignoredPaths: Set<string>
  ) {}

  static async capture(
    repoPath: string,
    options: RepoMutationGuardOptions = {}
  ): Promise<RepoMutationGuard> {
    const ignoredPaths = new Set(
      (options.ignoredPaths ?? []).map(value => normalizeRelativePath(value)).filter(Boolean)
    );
    return new RepoMutationGuard(repoPath, await snapshotRepository(repoPath, ignoredPaths), ignoredPaths);
  }

  async throwIfMutated(): Promise<void> {
    const after = await snapshotRepository(this.repoPath, this.ignoredPaths);
    if (after.size !== this.before.size) {
      throw new Error('Read-only guardrail violation: agent execution modified repository files.');
    }

    for (const [filePath, beforeState] of this.before) {
      const afterState = after.get(filePath);
      if (
        !afterState ||
        beforeState.sizeBytes !== afterState.sizeBytes ||
        beforeState.lastWriteMs !== afterState.lastWriteMs
      ) {
        throw new Error('Read-only guardrail violation: agent execution modified repository files.');
      }
    }
  }
}

async function snapshotRepository(
  repoPath: string,
  ignoredPaths: Set<string>
): Promise<Map<string, RepoFileState>> {
  const snapshot = new Map<string, RepoFileState>();
  await walk(repoPath, repoPath, snapshot, ignoredPaths);
  return snapshot;
}

async function walk(
  root: string,
  current: string,
  snapshot: Map<string, RepoFileState>,
  ignoredPaths: Set<string>
): Promise<void> {
  const entries = await fs.readdir(current, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll(path.sep, '/');

    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      continue;
    }

    if (isIgnoredPath(relativePath, ignoredPaths)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(root, fullPath, snapshot, ignoredPaths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.stat(fullPath);
    snapshot.set(relativePath, {
      sizeBytes: stats.size,
      lastWriteMs: stats.mtimeMs
    });
  }
}

function isIgnoredPath(relativePath: string, ignoredPaths: Set<string>): boolean {
  for (const ignoredPath of ignoredPaths) {
    if (relativePath === ignoredPath || relativePath.startsWith(`${ignoredPath}/`)) {
      return true;
    }
  }

  return false;
}

function normalizeRelativePath(value: string): string {
  return value.trim().replaceAll(path.sep, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
}
