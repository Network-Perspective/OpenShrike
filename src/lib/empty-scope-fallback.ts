export type EmptyScopeFallbackAction =
  | 'commit'
  | 'branch'
  | 'full'
  | 'last-scan'
  | 'skip';

export interface EmptyScopeFallbackContext {
  defaultBranchTarget: string | null;
}

export interface EmptyScopeFallbackOption {
  action: Exclude<EmptyScopeFallbackAction, 'skip'>;
  label: string;
  detail: string;
}

export function buildEmptyScopeFallbackOptions(
  context: EmptyScopeFallbackContext
): EmptyScopeFallbackOption[] {
  return [
    {
      action: 'commit',
      label: 'Scan last commit',
      detail: 'Scope: commit HEAD'
    },
    {
      action: 'branch',
      label: 'Scan current branch diff',
      detail: context.defaultBranchTarget
        ? `Target: ${context.defaultBranchTarget}`
        : 'Target: use the CLI default if it can be discovered'
    },
    {
      action: 'full',
      label: 'Scan whole repository',
      detail: 'Scope: full repository'
    },
    {
      action: 'last-scan',
      label: 'Show last scan results',
      detail: 'Load .openshrike/last-scan.json'
    }
  ];
}

export function resolveDefaultEmptyScopeFallbackAction(): Exclude<EmptyScopeFallbackAction, 'skip'> {
  return 'commit';
}
