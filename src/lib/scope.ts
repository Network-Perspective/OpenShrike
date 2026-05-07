import path from 'node:path';
import {
  MAX_SCOPE_EVIDENCE_OUTPUT_LINES,
  SCOPE_VALUES
} from './constants.js';
import {runProcess} from './process.js';
import type {
  ScanScopeContext,
  ScanScopeKind
} from './types.js';

interface PromptCommandCapture {
  description: string;
  command: string;
  output: string;
}

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
  const [trackedFiles, trackedDiffCapture, untrackedFiles] = await Promise.all([
    resolveFilesFromDiff(repoPath, 'HEAD'),
    captureGitCommand(
      repoPath,
      'Tracked changes relative to HEAD',
      buildDiffArgs('HEAD')
    ),
    resolveUntrackedFiles(repoPath)
  ]);
  const untrackedCaptures = await Promise.all(
    untrackedFiles.map(async filePath => {
      return await captureGitCommand(
        repoPath,
        `Untracked file patch: ${filePath}`,
        buildUntrackedDiffArgs(filePath),
        {allowedExitCodes: [0, 1]}
      );
    })
  );
  const files = [...trackedFiles, ...untrackedFiles].filter(uniqueIgnoreCase);

  return {
    kind: 'uncommitted',
    label: 'uncommitted changes',
    files,
    isFullRepository: false,
    scopeEvidence: finalizeScopeEvidence([trackedDiffCapture, ...untrackedCaptures])
  };
}

async function resolveCommit(repoPath: string, target?: string): Promise<ScanScopeContext> {
  if (!target) {
    throw new Error("Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'.");
  }

  const diffSpec = target.includes('..') ? target : `${target}^!`;
  const files = await resolveFilesFromDiff(repoPath, diffSpec);
  const diffCapture = await captureGitCommand(
    repoPath,
    `Commit diff for ${target}`,
    buildDiffArgs(diffSpec)
  );

  return {
    kind: 'commit',
    label: `commit ${target}`,
    files,
    isFullRepository: false,
    scopeEvidence: finalizeScopeEvidence([diffCapture])
  };
}

async function resolveBranch(repoPath: string, target?: string): Promise<ScanScopeContext> {
  if (!target) {
    throw new Error("Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'.");
  }

  const diffSpec = `${target}...HEAD`;
  const files = await resolveFilesFromDiff(repoPath, diffSpec);
  const diffCapture = await captureGitCommand(
    repoPath,
    `Branch diff for ${diffSpec}`,
    buildDiffArgs(diffSpec)
  );

  return {
    kind: 'branch',
    label: `branch diff ${diffSpec}`,
    files,
    isFullRepository: false,
    scopeEvidence: finalizeScopeEvidence([diffCapture])
  };
}

async function resolvePullRequest(repoPath: string, target?: string): Promise<ScanScopeContext> {
  const diffSpec = target?.trim() || 'origin/main...HEAD';
  const files = await resolveFilesFromDiff(repoPath, diffSpec);
  const diffCapture = await captureGitCommand(
    repoPath,
    `Pull request diff for ${diffSpec}`,
    buildDiffArgs(diffSpec)
  );

  return {
    kind: 'pr',
    label: `pull request diff ${diffSpec}`,
    files,
    isFullRepository: false,
    scopeEvidence: finalizeScopeEvidence([diffCapture])
  };
}

async function resolveFilesFromDiff(repoPath: string, diffSpec: string): Promise<string[]> {
  const {stdout} = await runGit(repoPath, ['diff', '--name-only', diffSpec]);
  return parseNameOnlyOutput(stdout);
}

async function resolveUntrackedFiles(repoPath: string): Promise<string[]> {
  const {stdout} = await runGit(repoPath, ['--no-pager', 'ls-files', '--others', '--exclude-standard']);
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

function buildDiffArgs(diffSpec: string): string[] {
  return [
    '--no-pager',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    '--submodule=short',
    '--relative',
    diffSpec
  ];
}

function buildUntrackedDiffArgs(filePath: string): string[] {
  return ['--no-pager', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath];
}

function finalizeScopeEvidence(captures: PromptCommandCapture[]): ScanScopeContext['scopeEvidence'] {
  const nonEmptyCaptures = captures.filter(capture => capture.output.trim().length > 0);
  if (totalOutputLines(nonEmptyCaptures) <= MAX_SCOPE_EVIDENCE_OUTPUT_LINES) {
    return {
      mode: 'complete',
      commands: nonEmptyCaptures
    };
  }

  return {
    mode: 'omitted',
    commands: nonEmptyCaptures.map(capture => ({
      description: capture.description,
      command: capture.command,
      output: ''
    }))
  };
}

function totalOutputLines(captures: PromptCommandCapture[]): number {
  return captures.reduce((sum, capture) => sum + countOutputLines(capture.output), 0);
}

function countOutputLines(output: string): number {
  const normalized = output.trimEnd();
  if (normalized.length === 0) {
    return 0;
  }

  return normalized.split('\n').length;
}

async function captureGitCommand(
  repoPath: string,
  description: string,
  args: string[],
  options: {
    allowedExitCodes?: number[];
  } = {}
): Promise<PromptCommandCapture> {
  const commandArgs = ['-C', repoPath, ...args];
  const {stdout} = await runProcess('git', commandArgs, {
    cwd: repoPath,
    ...(options.allowedExitCodes ? {allowedExitCodes: options.allowedExitCodes} : {})
  });

  return {
    description,
    command: formatShellCommand('git', commandArgs),
    output: stdout.trimEnd()
  };
}

function formatShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(' ');
}

function quoteShellArg(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

async function runGit(
  repoPath: string,
  args: string[],
  options: {
    allowedExitCodes?: number[];
  } = {}
) {
  return await runProcess('git', ['-C', repoPath, ...args], {
    cwd: repoPath,
    ...(options.allowedExitCodes ? {allowedExitCodes: options.allowedExitCodes} : {})
  });
}
