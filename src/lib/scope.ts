import path from 'node:path';
import {SCOPE_VALUES} from './constants.js';
import {runProcess} from './process.js';
import type {ScanScopeContext, ScanScopeKind} from './types.js';

export function parseScanScopeKind(value: string): ScanScopeKind | null {
  const normalized = value.trim().toLowerCase();
  return (SCOPE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as ScanScopeKind)
    : null;
}

export async function resolveScanScope(
  repoPath: string,
  kind: ScanScopeKind,
  target?: string
): Promise<ScanScopeContext> {
  await ensureGitRepository(repoPath);

  switch (kind) {
    case 'uncommitted':
      return await resolveUncommitted(repoPath);
    case 'commit':
      return await resolveCommit(repoPath, target);
    case 'branch':
      return await resolveBranch(repoPath, target);
    case 'pr':
      return await resolvePullRequest(repoPath, target);
    case 'full':
      return {
        kind,
        label: 'full repository',
        files: [],
        isFullRepository: true
      };
  }
}

async function resolveUncommitted(repoPath: string): Promise<ScanScopeContext> {
  const {stdout} = await runGit(repoPath, ['status', '--porcelain']);
  const files = stdout
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLinePath)
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(uniqueIgnoreCase);

  return {
    kind: 'uncommitted',
    label: 'uncommitted changes',
    files,
    isFullRepository: false
  };
}

async function resolveCommit(repoPath: string, target?: string): Promise<ScanScopeContext> {
  if (!target) {
    throw new Error("Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'.");
  }

  const files = target.includes('..')
    ? await resolveFilesFromDiff(repoPath, target)
    : await resolveFilesFromShow(repoPath, target);

  return {
    kind: 'commit',
    label: `commit ${target}`,
    files,
    isFullRepository: false
  };
}

async function resolveBranch(repoPath: string, target?: string): Promise<ScanScopeContext> {
  if (!target) {
    throw new Error("Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'.");
  }

  const diffSpec = `${target}...HEAD`;
  return {
    kind: 'branch',
    label: `branch diff ${diffSpec}`,
    files: await resolveFilesFromDiff(repoPath, diffSpec),
    isFullRepository: false
  };
}

async function resolvePullRequest(repoPath: string, target?: string): Promise<ScanScopeContext> {
  const diffSpec = target?.trim() || 'origin/main...HEAD';
  return {
    kind: 'pr',
    label: `pull request diff ${diffSpec}`,
    files: await resolveFilesFromDiff(repoPath, diffSpec),
    isFullRepository: false
  };
}

async function resolveFilesFromDiff(repoPath: string, diffSpec: string): Promise<string[]> {
  const {stdout} = await runGit(repoPath, ['diff', '--name-only', diffSpec]);
  return parseNameOnlyOutput(stdout);
}

async function resolveFilesFromShow(repoPath: string, commitRef: string): Promise<string[]> {
  const {stdout} = await runGit(repoPath, ['show', '--pretty=format:', '--name-only', commitRef]);
  return parseNameOnlyOutput(stdout);
}

function parseNameOnlyOutput(output: string): string[] {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(uniqueIgnoreCase);
}

function parseStatusLinePath(line: string): string {
  if (line.length < 4) {
    return '';
  }

  const pathPart = line.slice(3);
  const renameSeparator = pathPart.indexOf(' -> ');
  const resolvedPath = renameSeparator >= 0 ? pathPart.slice(renameSeparator + 4).trim() : pathPart.trim();
  return unquotePath(resolvedPath);
}

function unquotePath(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }

  return value;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function uniqueIgnoreCase(value: string, index: number, values: string[]): boolean {
  return values.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index;
}

async function ensureGitRepository(repoPath: string): Promise<void> {
  try {
    await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
  } catch (error) {
    throw new Error(`Repository path is not a valid git repository: ${path.resolve(repoPath)}`, {
      cause: error
    });
  }
}

async function runGit(repoPath: string, args: string[]) {
  return await runProcess('git', ['-C', repoPath, ...args], {cwd: repoPath});
}
