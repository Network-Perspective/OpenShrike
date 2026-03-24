import fs from 'node:fs/promises';
import path from 'node:path';

interface RepoFileState {
  sizeBytes: number;
  lastWriteMs: number;
}

export class RepoMutationGuard {
  private constructor(
    private readonly repoPath: string,
    private readonly before: Map<string, RepoFileState>
  ) {}

  static async capture(repoPath: string): Promise<RepoMutationGuard> {
    return new RepoMutationGuard(repoPath, await snapshotRepository(repoPath));
  }

  async throwIfMutated(): Promise<void> {
    const after = await snapshotRepository(this.repoPath);
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

async function snapshotRepository(repoPath: string): Promise<Map<string, RepoFileState>> {
  const snapshot = new Map<string, RepoFileState>();
  await walk(repoPath, repoPath, snapshot);
  return snapshot;
}

async function walk(
  root: string,
  current: string,
  snapshot: Map<string, RepoFileState>
): Promise<void> {
  const entries = await fs.readdir(current, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll(path.sep, '/');

    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(root, fullPath, snapshot);
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
