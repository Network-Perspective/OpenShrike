import {formatCheckIdDisplay} from '../lib/check-display.js';
import {SHRIKE_CLI_INSTALL_COMMAND, type InitEnvironmentState} from './init-environment-state.js';
import {
  formatConfidence,
  getStatusLabel,
  sortFindings,
  type Finding,
  type FindingSortMode,
  type FindingStatus,
  type ScanState
} from './scan-data.js';

export interface ScanFindingItem {
  id: string;
  idLabel: string;
  title: string;
  summary: string;
  status: FindingStatus;
  statusLabel: string;
  isSelected: boolean;
}

export interface ScanSelectedFinding {
  id: string;
  idLabel: string;
  title: string;
  summary: string;
  detailSummary: string;
  rationale: string;
  status: FindingStatus;
  statusLabel: string;
  confidenceLabel: string | null;
  remediation: string[];
  checkMarkdown: string;
  evidence: Finding['evidence'];
  canRecheck: boolean;
  canFix: boolean;
}

export interface ScanViewModel {
  workspaceName: string;
  workspacePath: string;
  statusKind: ScanState['statusKind'];
  statusLabel: string;
  generatedAtLabel: string;
  targetLabel: string;
  durationLabel: string;
  tokensLabel: string;
  scopeLabel: string;
  scanTargetLabel: string;
  runtimeModeLabel: string;
  parallelismLabel: string;
  activeOperationLabel: string;
  counts: ScanState['counts'];
  visibleFindingCount: number;
  checksHeading: string;
  sortMode: FindingSortMode;
  sortLabel: string;
  items: ScanFindingItem[];
  selectedFinding: ScanSelectedFinding | null;
  statusBarText: string;
  statusBarTooltip: string;
  lastScanPath: string;
  warnings: string[];
  canCancel: boolean;
  hasFindings: boolean;
  isInitialized: boolean;
  initEnvironment: InitEnvironmentState;
  canRunInit: boolean;
  showInstallNodeAction: boolean;
  showInstallShrikeAction: boolean;
  showRefreshAction: boolean;
}

export function buildScanViewModel(input: {
  state: ScanState;
  selectedFindingId: string | null;
  sortMode: FindingSortMode;
}): ScanViewModel {
  const {state, selectedFindingId, sortMode} = input;
  const hasWorkspace = state.workspaceName !== 'No Workspace Open';
  const sortedFindings = sortFindings(state.findings, sortMode);
  const items = buildFindingItems(sortedFindings, selectedFindingId);
  const selectedFinding = state.findings.find(finding => finding.id === selectedFindingId) ?? null;
  const statusBarText = buildStatusBarText(state);
  const statusBarTooltip = buildStatusBarTooltip(state);

  return {
    workspaceName: state.workspaceName,
    workspacePath: state.workspacePath,
    statusKind: state.statusKind,
    statusLabel: state.statusLabel,
    generatedAtLabel: state.generatedAtLabel,
    targetLabel: state.targetLabel,
    durationLabel: state.durationLabel,
    tokensLabel: state.tokensLabel,
    scopeLabel: state.scopeLabel,
    scanTargetLabel: state.scanTargetLabel,
    runtimeModeLabel: state.runtimeModeLabel,
    parallelismLabel: state.parallelismLabel,
    activeOperationLabel: state.activeOperationLabel,
    counts: state.counts,
    visibleFindingCount: state.findings.length,
    checksHeading: `Checks (${state.findings.length})`,
    sortMode,
    sortLabel: formatSortMode(sortMode),
    items,
    selectedFinding: selectedFinding
      ? {
          id: selectedFinding.id,
          idLabel: formatCheckIdDisplay(selectedFinding.id),
          title: selectedFinding.title,
          summary: selectedFinding.summary,
          detailSummary: buildDetailSummary(selectedFinding),
          rationale: selectedFinding.rationale,
          status: selectedFinding.status,
          statusLabel: getStatusLabel(selectedFinding.status),
          confidenceLabel: selectedFinding.confidence
            ? formatConfidence(selectedFinding.confidence)
            : null,
          remediation: selectedFinding.remediation,
          checkMarkdown: selectedFinding.checkMarkdown,
          evidence: selectedFinding.evidence,
          canRecheck: canRecheckFinding(selectedFinding.status),
          canFix: selectedFinding.status === 'fail'
        }
      : null,
    statusBarText,
    statusBarTooltip,
    lastScanPath: state.lastScanPath,
    warnings: [...state.warnings],
    canCancel: state.canCancel,
    hasFindings: state.findings.length > 0,
    isInitialized: state.isInitialized,
    initEnvironment: state.initEnvironment,
    canRunInit: hasWorkspace && !state.isInitialized && state.initEnvironment.statusKind === 'ready',
    showInstallNodeAction: hasWorkspace && !state.isInitialized && ['missing', 'unsupported'].includes(state.initEnvironment.statusKind),
    showInstallShrikeAction: hasWorkspace && !state.isInitialized && state.initEnvironment.statusKind === 'cli-missing',
    showRefreshAction: hasWorkspace && !state.isInitialized
  };
}

function buildStatusBarText(state: ScanState): string {
  if (!state.isInitialized) {
    return '$(warning) OpenShrike: Init Required';
  }

  switch (state.statusKind) {
    case 'running':
      return `$(sync~spin) OpenShrike: ${state.counts.completed}/${state.counts.total}`;
    case 'cancelling':
      return '$(debug-stop) OpenShrike: Cancelling';
    case 'cancelled':
      return '$(circle-slash) OpenShrike: Cancelled';
    case 'failed':
      return '$(error) OpenShrike: Failed';
    case 'loaded':
      return `$(history) OpenShrike: ${state.counts.fail} failed`;
    case 'completed':
      return `$(shield) OpenShrike: ${state.counts.fail} failed`;
    case 'idle':
      return '$(shield) OpenShrike: Ready';
  }
}

function buildStatusBarTooltip(state: ScanState): string {
  if (!state.isInitialized) {
    return buildUninitializedStatusBarTooltip(state.initEnvironment);
  }

  const statusBarTooltipLines = [
    `${state.statusLabel}`,
    `${state.counts.total} total checks`,
    `${state.counts.completed} completed`,
    `${state.counts.fail} failed`,
    `${state.counts.unknown} inconclusive`,
    `${state.counts.pass} passed`,
    `Runtime: ${state.runtimeModeLabel}`,
    `Parallelism: ${state.parallelismLabel}`,
    state.canCancel ? 'Click to cancel the active scan.' : 'Click to open the OpenShrike output channel.'
  ];

  if (state.counts.fixing > 0) {
    statusBarTooltipLines.splice(2, 0, `${state.counts.fixing} fixing`);
  }

  if (state.counts.running > 0) {
    statusBarTooltipLines.splice(2, 0, `${state.counts.running} in progress`);
  }

  if (state.counts.pending > 0) {
    statusBarTooltipLines.splice(2, 0, `${state.counts.pending} pending`);
  }

  return statusBarTooltipLines.join('\n');
}

function buildUninitializedStatusBarTooltip(initEnvironment: InitEnvironmentState): string {
  switch (initEnvironment.statusKind) {
    case 'checking':
      return [
        'Repository not initialized for OpenShrike.',
        'Checking Node.js and shrike CLI on the workspace host before enabling `shrike init`.'
      ].join('\n');
    case 'ready':
      return [
        'Repository not initialized for OpenShrike.',
        `Node.js ${initEnvironment.detectedNodeVersion ?? ''} and shrike CLI are available on the workspace host.`,
        'Run `shrike init` in the integrated terminal, then click "Done" or run a scan.'
      ].join('\n');
    case 'missing':
      return [
        'Repository not initialized for OpenShrike.',
        'Node.js 22+ was not found on the workspace host.',
        'Install Node.js on the workspace host, then click "Done" and run `shrike init`.'
      ].join('\n');
    case 'unsupported':
      return [
        'Repository not initialized for OpenShrike.',
        `${initEnvironment.detectedNodeVersion ?? 'The detected Node.js version'} does not satisfy Node.js 22+.`,
        'Install a newer Node.js version on the workspace host, then click "Done" and run `shrike init`.'
      ].join('\n');
    case 'cli-missing':
      return [
        'Repository not initialized for OpenShrike.',
        'The shrike CLI was not found on the workspace host.',
        `Install it with \`${SHRIKE_CLI_INSTALL_COMMAND}\`, then click "Done" and run \`shrike init\`.`
      ].join('\n');
    case 'error':
      return [
        'Repository not initialized for OpenShrike.',
        'OpenShrike could not verify Node.js and shrike CLI on the workspace host.',
        'Verify `node --version` and `shrike --version` in a terminal on the workspace host, then click "Done".'
      ].join('\n');
  }
}

function buildFindingItems(
  findings: Finding[],
  selectedFindingId: string | null
): ScanFindingItem[] {
  return findings.map(finding => ({
    id: finding.id,
    idLabel: formatCheckIdDisplay(finding.id),
    title: finding.title,
    summary: finding.summary,
    status: finding.status,
    statusLabel: getStatusLabel(finding.status),
    isSelected: finding.id === selectedFindingId
  }));
}

function buildDetailSummary(finding: Finding): string {
  const trimmedRationale = finding.rationale.trim();
  if (!trimmedRationale) {
    return finding.summary;
  }
  return trimmedRationale;
}

function canRecheckFinding(status: FindingStatus): boolean {
  return status === 'fail' || status === 'unknown' || status === 'pass' || status === 'pending';
}

export function formatSortMode(sortMode: FindingSortMode): string {
  switch (sortMode) {
    case 'id':
      return 'ID';
    case 'status':
      return 'Status';
    case 'name':
      return 'Name';
  }
}
