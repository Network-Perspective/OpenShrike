import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {CliError} from './cli-error.js';
import {
  CONFIG_DIRECTORY_NAME,
  LAST_SCAN_JSON_FILE_NAME,
  LAST_SCAN_MARKDOWN_FILE_NAME
} from './constants.js';
import {renderScanReportMarkdown} from './markdown.js';
import {findNearestProjectConfigPath} from './project-config.js';
import {runProcess} from './process.js';
import {resolveScanScope} from './scope.js';
import type {
  SavedLastScanState,
  SavedScanRequest,
  SavedScanScope,
  ScanCommandOptions,
  ScanReport,
  ScanScopeContext
} from './types.js';

const savedScanStateSchema = z.object({
  version: z.literal(1),
  savedAt: z.string().trim().min(1),
  repo: z.object({
    path: z.string().trim().min(1),
    head: z.string().trim().min(1).nullable(),
    dirty: z.boolean()
  }),
  request: z.object({
    checkId: z.string().trim().min(1).nullable(),
    policyId: z.string().trim().min(1).nullable(),
    projectChecksDir: z.string().trim().min(1).nullable(),
    scanScope: z.enum(['uncommitted', 'commit', 'branch', 'pr', 'full']),
    scanTarget: z.string().trim().min(1).nullable(),
    runtimeMode: z.enum(['native', 'docker'])
  }),
  scope: z.object({
    kind: z.enum(['uncommitted', 'commit', 'branch', 'pr', 'full']),
    label: z.string().trim().min(1),
    files: z.array(z.string().trim().min(1)),
    isFullRepository: z.boolean()
  }).optional(),
  report: z.object({
    bundle_id: z.string(),
    policy_version: z.string(),
    repo: z.object({
      path: z.string()
    }),
    execution: z.object({
      runtime_mode: z.enum(['native', 'docker']),
      requested_parallelism: z.union([z.number().int().min(1), z.literal('auto'), z.literal('full')]),
      effective_parallelism: z.number().int().min(0),
      artifacts_dir: z.string().nullable()
    }).optional(),
    summary: z.object({
      total_checks: z.number().int().min(0),
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      unknown: z.number().int().min(0)
    }),
    checks: z.array(z.object({
      id: z.string(),
      version: z.string(),
      status: z.enum(['pass', 'fail', 'unknown']),
      confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      evidence: z.array(z.string()),
      rationale: z.string(),
      remediation: z.array(z.string())
    }))
  })
});

export async function saveLastScanState(options: {
  report: ScanReport;
  request: SavedScanRequest;
  scope?: SavedScanScope | ScanScopeContext | undefined;
}): Promise<string[]> {
  const repoPath = path.resolve(options.report.repo.path);
  const paths = await resolveLastScanPaths(repoPath);
  const savedAt = new Date().toISOString();
  const metadata = await resolveGitMetadata(repoPath);
  const scope = options.scope ?? await resolveSavedScanScope(repoPath, options.request);
  const payload: SavedLastScanState = {
    version: 1,
    savedAt,
    repo: {
      path: repoPath,
      head: metadata.head,
      dirty: metadata.dirty
    },
    request: options.request,
    scope: serializeSavedScanScope(scope),
    report: options.report
  };

  await fs.mkdir(path.dirname(paths.jsonPath), {recursive: true});
  await fs.writeFile(paths.jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    await fs.writeFile(paths.markdownPath, `${renderSavedScanMarkdown(payload)}\n`, 'utf8');
  } catch (error) {
    return [
      `Saved ${LAST_SCAN_JSON_FILE_NAME}, but failed to write ${LAST_SCAN_MARKDOWN_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`
    ];
  }

  return [];
}

export async function loadLastScanState(repoPath: string): Promise<{
  state: SavedLastScanState;
  warnings: string[];
}> {
  const paths = await resolveLastScanPaths(repoPath);
  let raw: string;

  try {
    raw = await fs.readFile(paths.jsonPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new CliError(
        'INVALID_ARGUMENTS',
        `Saved last-scan state not found at ${paths.jsonPath}. Run \`shrike scan\` first.`
      );
    }

    throw new CliError(
      'SCAN_FAILED',
      `Failed to read saved last-scan state at ${paths.jsonPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsed: SavedLastScanState;
  try {
    parsed = savedScanStateSchema.parse(JSON.parse(raw)) as SavedLastScanState;
  } catch (error) {
    throw new CliError(
      'INVALID_ARGUMENTS',
      `Saved last-scan state at ${paths.jsonPath} is incompatible or unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const normalized: SavedLastScanState = {
    ...parsed,
    scope: parsed.scope ?? serializeSavedScanScope(
      await resolveSavedScanScope(path.resolve(parsed.repo.path), parsed.request)
    )
  };

  const currentMetadata = await resolveGitMetadata(path.resolve(normalized.repo.path));
  const warnings = buildSavedStateWarnings(normalized, currentMetadata);

  return {
    state: normalized,
    warnings
  };
}

export async function resolveLastScanPaths(repoPath: string): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const absoluteRepoPath = path.resolve(repoPath);
  const projectConfigPath = await findNearestProjectConfigPath(absoluteRepoPath);
  const repoRoot = projectConfigPath
    ? path.resolve(path.dirname(projectConfigPath), '..')
    : absoluteRepoPath;
  const configDir = path.join(repoRoot, CONFIG_DIRECTORY_NAME);

  return {
    jsonPath: path.join(configDir, LAST_SCAN_JSON_FILE_NAME),
    markdownPath: path.join(configDir, LAST_SCAN_MARKDOWN_FILE_NAME)
  };
}

export function createSavedScanRequest(options: Pick<ScanCommandOptions, 'checkId' | 'policyId' | 'projectChecksDir' | 'scanScope' | 'scanTarget' | 'runtimeMode'>): SavedScanRequest {
  return {
    checkId: options.checkId ?? null,
    policyId: options.policyId ?? null,
    projectChecksDir: options.projectChecksDir ? path.resolve(options.projectChecksDir) : null,
    scanScope: options.scanScope,
    scanTarget: options.scanTarget ?? null,
    runtimeMode: options.runtimeMode
  };
}

function renderSavedScanMarkdown(state: SavedLastScanState): string {
  const selection = formatSelection(state.request);
  return [
    '# OpenShrike Last Scan',
    '',
    `- Saved at: \`${state.savedAt}\``,
    `- Repository: \`${state.repo.path}\``,
    `- Selection: \`${selection}\``,
    `- Scope: \`${formatSavedScopeLabel(state)}\``,
    ...(state.scope && !state.scope.isFullRepository
      ? [`- Scoped files: ${state.scope.files.length}`]
      : []),
    '',
    `JSON source of truth: \`${LAST_SCAN_JSON_FILE_NAME}\``,
    ...(state.scope && !state.scope.isFullRepository && state.scope.files.length > 0
      ? [
          '',
          '## Scoped Files',
          '',
          ...state.scope.files.map(filePath => `- \`${filePath}\``)
        ]
      : []),
    '',
    renderScanReportMarkdown(state.report)
  ].join('\n');
}

function formatSelection(request: SavedScanRequest): string {
  if (request.projectChecksDir && request.checkId) {
    return `${request.checkId} from ${request.projectChecksDir}`;
  }

  if (request.projectChecksDir) {
    return request.projectChecksDir;
  }

  return request.checkId ?? request.policyId ?? 'unknown';
}

function formatSavedScopeLabel(state: SavedLastScanState): string {
  if (state.scope?.kind === 'full') {
    return 'full repository';
  }

  return state.scope?.label
    ?? `${state.request.scanScope}${state.request.scanTarget ? ` (${state.request.scanTarget})` : ''}`;
}

function serializeSavedScanScope(scope: SavedScanScope | ScanScopeContext): SavedScanScope {
  return {
    kind: scope.kind,
    label: scope.label,
    files: [...scope.files],
    isFullRepository: scope.isFullRepository
  };
}

async function resolveSavedScanScope(repoPath: string, request: SavedScanRequest): Promise<SavedScanScope> {
  if (request.scanScope === 'full') {
    return {
      kind: 'full',
      label: 'full repository',
      files: [],
      isFullRepository: true
    };
  }

  const scope = await resolveScanScope(repoPath, request.scanScope, request.scanTarget ?? undefined);
  return serializeSavedScanScope(scope);
}

function buildSavedStateWarnings(
  state: SavedLastScanState,
  currentMetadata: {head: string | null; dirty: boolean}
): string[] {
  const warnings: string[] = [];

  if (currentMetadata.head && state.repo.head && currentMetadata.head !== state.repo.head) {
    warnings.push(
      `Saved last-scan was recorded at HEAD ${state.repo.head}, but the repository is now at ${currentMetadata.head}.`
    );
  }

  if (currentMetadata.dirty !== state.repo.dirty) {
    warnings.push(
      `Saved last-scan recorded dirty=${state.repo.dirty}, but the repository is now dirty=${currentMetadata.dirty}.`
    );
  }

  return warnings;
}

async function resolveGitMetadata(repoPath: string): Promise<{
  head: string | null;
  dirty: boolean;
}> {
  const [headResult, statusResult] = await Promise.all([
    runProcess('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      allowedExitCodes: [0, 128]
    }).catch(() => ({stdout: '', stderr: ''})),
    runProcess('git', ['status', '--porcelain'], {
      cwd: repoPath,
      allowedExitCodes: [0, 128]
    }).catch(() => ({stdout: '', stderr: ''}))
  ]);

  const head = headResult.stdout.trim() || null;
  return {
    head,
    dirty: statusResult.stdout.trim().length > 0
  };
}
