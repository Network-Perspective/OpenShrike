import {
  DEFAULT_PARALLELISM,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SCAN_SCOPE
} from '../lib/constants.js';
import {loadProjectConfigForRepo} from '../lib/project-config.js';
import {discoverDefaultPullRequestTarget} from '../lib/scope.js';
import type {
  ParallelismValue,
  RuntimeMode,
  SavedScanRequest,
  SavedScanScope,
  ScanScopeKind
} from '../lib/types.js';

export interface ScopeSelection {
  scanScope: ScanScopeKind;
  scanTarget: string | null;
}

export interface WorkspaceScanDefaults {
  scopeSelection: ScopeSelection;
  scopeLabel: string;
  runtimeMode: RuntimeMode;
  parallelism: ParallelismValue;
}

export async function resolveWorkspaceScanDefaults(repoPath: string): Promise<WorkspaceScanDefaults> {
  const loadedProjectConfig = await loadProjectConfigForRepo(repoPath).catch(() => null);
  const scopeSelection = {
    scanScope: loadedProjectConfig?.config.scan.scope ?? DEFAULT_SCAN_SCOPE,
    scanTarget: null
  } satisfies ScopeSelection;

  return {
    scopeSelection,
    scopeLabel: await resolveScopeSelectionLabel(repoPath, scopeSelection),
    runtimeMode: loadedProjectConfig?.config.runtime.mode ?? DEFAULT_RUNTIME_MODE,
    parallelism: loadedProjectConfig?.config.runtime.parallelism ?? DEFAULT_PARALLELISM
  };
}

export async function resolveScopeSelectionLabel(
  repoPath: string,
  selection: ScopeSelection
): Promise<string> {
  return await resolveScopeLabel(repoPath, selection.scanScope, selection.scanTarget);
}

export async function resolveRequestScopeLabel(
  repoPath: string,
  request: SavedScanRequest | null,
  fallback = formatScopeKindLabel(DEFAULT_SCAN_SCOPE)
): Promise<string> {
  if (!request) {
    return fallback;
  }

  return await resolveScopeLabel(repoPath, request.scanScope, request.scanTarget);
}

export async function resolvePersistedScopeLabel(
  repoPath: string,
  request: SavedScanRequest | null,
  scope: SavedScanScope | null,
  fallback = formatScopeKindLabel(DEFAULT_SCAN_SCOPE)
): Promise<string> {
  if (scope?.label) {
    return scope.label;
  }

  return await resolveRequestScopeLabel(repoPath, request, fallback);
}

export async function resolveScopeLabel(
  repoPath: string,
  scope: ScanScopeKind,
  target: string | null | undefined
): Promise<string> {
  const normalizedTarget = normalizeTarget(target);

  switch (scope) {
    case 'uncommitted':
      return 'uncommitted changes';
    case 'commit':
      return `commit ${normalizedTarget ?? 'HEAD'}`;
    case 'branch': {
      const defaultTarget = normalizedTarget ?? await discoverDefaultPullRequestTarget(repoPath).catch(() => null);
      if (!defaultTarget) {
        return 'branch diff';
      }

      const diffSpec = defaultTarget.includes('..') ? defaultTarget : `${defaultTarget}...HEAD`;
      return `branch diff ${diffSpec}`;
    }
    case 'pr': {
      const diffSpec = normalizedTarget ?? await discoverDefaultPullRequestTarget(repoPath).catch(() => null);
      return diffSpec ? `pull request diff ${diffSpec}` : 'pull request diff';
    }
    case 'full':
      return 'full repository';
  }
}

function normalizeTarget(target: string | null | undefined): string | null {
  const trimmed = target?.trim();
  return trimmed ? trimmed : null;
}

function formatScopeKindLabel(scope: ScanScopeKind): string {
  switch (scope) {
    case 'uncommitted':
      return 'uncommitted changes';
    case 'commit':
      return 'commit HEAD';
    case 'branch':
      return 'branch diff';
    case 'pr':
      return 'pull request diff';
    case 'full':
      return 'full repository';
  }
}
