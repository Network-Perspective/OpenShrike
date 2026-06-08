import {formatCheckIdDisplay} from '../lib/check-display.js';
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
}

export function buildScanViewModel(input: {
  state: ScanState;
  selectedFindingId: string | null;
  sortMode: FindingSortMode;
}): ScanViewModel {
  const {state, selectedFindingId, sortMode} = input;
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
          evidence: selectedFinding.evidence
        }
      : null,
    statusBarText,
    statusBarTooltip,
    lastScanPath: state.lastScanPath,
    warnings: [...state.warnings],
    canCancel: state.canCancel,
    hasFindings: state.findings.length > 0,
    isInitialized: state.isInitialized
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
    return [
      'Repository not initialized for OpenShrike.',
      'Run `shrike init` in the integrated terminal, then return here and run a scan.'
    ].join('\n');
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
