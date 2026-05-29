import fs from 'node:fs/promises';
import * as vscode from 'vscode';
import {getProjectChecksDirectory} from '../lib/checks.js';
import {listPolicyCatalog} from '../lib/policies.js';
import {discoverDefaultPullRequestTarget} from '../lib/scope.js';
import type {ParallelismValue, RuntimeMode, ScanCommandOptions, ScanScopeKind} from '../lib/types.js';

type ScanSelectionChoice = vscode.QuickPickItem & (
  | {selectionKind: 'default'}
  | {selectionKind: 'check'}
  | {selectionKind: 'policy'}
  | {selectionKind: 'project-checks'}
);

type ScanScopeChoice = vscode.QuickPickItem & (
  | {selectionKind: 'default'}
  | {selectionKind: 'scope'; scope: ScanScopeKind}
);

export async function promptForScanOverrides(repoPath: string): Promise<Partial<ScanCommandOptions> | null> {
  const overrides: Partial<ScanCommandOptions> = {};
  const projectChecksDir = await resolveProjectChecksDirectory(repoPath);
  const selectionChoices: ScanSelectionChoice[] = [
    {
      label: 'Use configured default',
      description: 'Use the workspace default selection',
      selectionKind: 'default'
    },
    {
      label: 'Single check',
      description: 'Override with a specific check id',
      selectionKind: 'check'
    },
    {
      label: 'Policy',
      description: 'Override with a bundled policy',
      selectionKind: 'policy'
    },
    ...(projectChecksDir
      ? [{
          label: 'Project checks directory',
          description: projectChecksDir,
          selectionKind: 'project-checks' as const
        }]
      : [])
  ];

  const selection = await vscode.window.showQuickPick<ScanSelectionChoice>(
    selectionChoices,
    {
      title: 'OpenShrike Scan Overrides',
      placeHolder: 'Choose what to scan'
    }
  );
  if (!selection) {
    return null;
  }

  if (selection.selectionKind === 'check') {
    const checkId = await vscode.window.showInputBox({
      title: 'Single Check',
      placeHolder: 'e.g. bp-sec-001-boundary-input-validation',
      validateInput: value => value.trim() ? null : 'Enter a check id.'
    });
    if (checkId === undefined) {
      return null;
    }

    overrides.checkId = checkId.trim();
    overrides.policyId = undefined;
    overrides.projectChecksDir = undefined;
  }

  if (selection.selectionKind === 'policy') {
    const catalog = await listPolicyCatalog();
    const pickedPolicy = await vscode.window.showQuickPick(
      catalog.map(policy => ({
        label: policy.id,
        description: policy.title
      })),
      {
        title: 'Policy Override',
        placeHolder: 'Choose a policy to scan'
      }
    );
    if (!pickedPolicy) {
      return null;
    }

    overrides.policyId = pickedPolicy.label;
    overrides.checkId = undefined;
    overrides.projectChecksDir = undefined;
  }

  if (selection.selectionKind === 'project-checks') {
    overrides.projectChecksDir = projectChecksDir;
    overrides.checkId = undefined;
    overrides.policyId = undefined;
  }

  const scopeOverrides = await promptForScanScopeOverride(repoPath);
  if (scopeOverrides === null) {
    return null;
  }

  Object.assign(overrides, scopeOverrides);

  const runtimeOverrides = await promptForScanRuntimeOverride();
  if (runtimeOverrides === null) {
    return null;
  }

  Object.assign(overrides, runtimeOverrides);

  const parallelism = await vscode.window.showQuickPick(
    [
      {label: 'Use configured default', value: null as ParallelismValue | null, description: 'Keep the workspace parallelism'},
      {label: 'Auto', value: 'auto' as const},
      {label: 'Full', value: 'full' as const},
      {label: '1', value: 1},
      {label: '2', value: 2},
      {label: '4', value: 4},
      {label: 'Custom number', value: 'custom' as const}
    ],
    {
      title: 'Parallelism',
      placeHolder: 'Choose how many checks can run concurrently'
    }
  );
  if (!parallelism) {
    return null;
  }

  if (parallelism.value === 'custom') {
    const customParallelism = await vscode.window.showInputBox({
      title: 'Custom Parallelism',
      placeHolder: 'Enter a whole number greater than 0',
      validateInput: value => {
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed > 0 ? null : 'Enter a whole number greater than 0.';
      }
    });
    if (customParallelism === undefined) {
      return null;
    }

    overrides.parallelism = Number.parseInt(customParallelism, 10);
  } else if (parallelism.value !== null) {
    overrides.parallelism = parallelism.value;
  }

  const mockRuntime = await vscode.window.showQuickPick(
    [
      {label: 'Live runtime', value: false, description: 'Use the configured OpenCode runtime'},
      {label: 'Mock runtime', value: true, description: 'Return emulated results without OpenCode'}
    ],
    {
      title: 'Mock Runtime',
      placeHolder: 'Choose whether to emulate OpenCode'
    }
  );
  if (!mockRuntime) {
    return null;
  }

  overrides.mockOpencode = mockRuntime.value;
  return overrides;
}

export async function promptForScanRuntimeOverride(): Promise<Partial<Pick<ScanCommandOptions, 'runtimeMode'>> | null> {
  const runtimeMode = await promptForRuntimeModeOverride();
  if (!runtimeMode) {
    return null;
  }

  return runtimeMode.value
    ? {runtimeMode: runtimeMode.value}
    : {};
}

export async function promptForRuntimeModeSelection(): Promise<RuntimeMode | null> {
  const runtimeMode = await vscode.window.showQuickPick(
    [
      {label: 'Native runtime', value: 'native' as const},
      {label: 'Docker runtime', value: 'docker' as const}
    ],
    {
      title: 'Runtime Mode',
      placeHolder: 'Choose the runtime mode for future scans'
    }
  );
  return runtimeMode?.value ?? null;
}

export async function promptForScanScopeOverride(
  repoPath: string
): Promise<Partial<Pick<ScanCommandOptions, 'scanScope' | 'scanTarget'>> | null> {
  const scope = await vscode.window.showQuickPick<ScanScopeChoice>(
    SCAN_SCOPE_ITEMS,
    {
      title: 'Scan Scope',
      placeHolder: 'Choose the scan scope'
    }
  );
  if (!scope) {
    return null;
  }

  if (scope.selectionKind !== 'scope') {
    return {};
  }

  const scopeTarget = await promptForScopeTarget(repoPath, scope.scope);
  if (scopeTarget === null) {
    return null;
  }

  return {
    scanScope: scope.scope,
    ...(scopeTarget ? {scanTarget: scopeTarget} : {})
  };
}

export async function promptForScanScopeSelection(
  repoPath: string
): Promise<Pick<ScanCommandOptions, 'scanScope' | 'scanTarget'> | null> {
  const scopeChoices = SCAN_SCOPE_ITEMS.filter((item): item is Extract<ScanScopeChoice, {selectionKind: 'scope'}> => item.selectionKind === 'scope');
  const scope = await vscode.window.showQuickPick(
    scopeChoices,
    {
      title: 'Scan Scope',
      placeHolder: 'Choose the default scope for future scans'
    }
  );
  if (!scope) {
    return null;
  }

  const scopeTarget = await promptForScopeTarget(repoPath, scope.scope);
  if (scopeTarget === null) {
    return null;
  }

  return {
    scanScope: scope.scope,
    scanTarget: scopeTarget ?? undefined
  };
}

async function promptForScopeTarget(repoPath: string, scope: ScanScopeKind): Promise<string | undefined | null> {
  switch (scope) {
    case 'commit': {
      const target = await vscode.window.showInputBox({
        title: 'Commit Target',
        placeHolder: 'e.g. HEAD or a commit sha',
        validateInput: value => value.trim() ? null : 'Enter a commit or commit range.'
      });
      return target === undefined ? null : target.trim();
    }
    case 'branch': {
      const defaultTarget = await discoverDefaultPullRequestTarget(repoPath).catch(() => null);
      const target = await vscode.window.showInputBox({
        title: 'Base Branch',
        placeHolder: defaultTarget ?? 'e.g. origin/main',
        value: defaultTarget?.replace(/\.\.\.HEAD$/u, '') ?? '',
        validateInput: value => value.trim() ? null : 'Enter a base branch.'
      });
      return target === undefined ? null : target.trim();
    }
    case 'pr': {
      const defaultTarget = await discoverDefaultPullRequestTarget(repoPath).catch(() => null);
      const target = await vscode.window.showInputBox({
        title: 'Pull Request Diff Target',
        placeHolder: defaultTarget ?? 'e.g. origin/main...HEAD',
        value: defaultTarget ?? '',
        validateInput: value => value.trim() ? null : 'Enter a diff target.'
      });
      return target === undefined ? null : target.trim();
    }
    case 'full':
    case 'uncommitted':
      return undefined;
  }
}

async function resolveProjectChecksDirectory(repoPath: string): Promise<string | undefined> {
  const projectChecksDir = getProjectChecksDirectory(repoPath);

  try {
    const stats = await fs.stat(projectChecksDir);
    return stats.isDirectory() ? projectChecksDir : undefined;
  } catch {
    return undefined;
  }
}

async function promptForRuntimeModeOverride(): Promise<{label: string; value: RuntimeMode | null; description?: string} | undefined> {
  return await vscode.window.showQuickPick(
    [
      {label: 'Use configured default', value: null, description: 'Keep the workspace runtime mode'},
      {label: 'Native runtime', value: 'native' as const},
      {label: 'Docker runtime', value: 'docker' as const}
    ],
    {
      title: 'Runtime Mode',
      placeHolder: 'Choose the runtime mode'
    }
  );
}

const SCAN_SCOPE_ITEMS: readonly ScanScopeChoice[] = [
  {label: 'Use configured default', description: 'Keep the workspace default scope', selectionKind: 'default'},
  {label: 'Uncommitted changes', selectionKind: 'scope', scope: 'uncommitted'},
  {label: 'Last commit', selectionKind: 'scope', scope: 'commit'},
  {label: 'Current branch diff', selectionKind: 'scope', scope: 'branch'},
  {label: 'Pull request diff', selectionKind: 'scope', scope: 'pr'},
  {label: 'Full repository', selectionKind: 'scope', scope: 'full'}
];
