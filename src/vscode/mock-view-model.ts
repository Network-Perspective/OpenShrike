import {formatCheckIdDisplay} from '../lib/check-display.js';
import {
  formatConfidence,
  getStatusLabel,
  sortMockFindings,
  type MockFinding,
  type MockFindingSortMode,
  type MockFindingStatus,
  type MockScanState
} from './mock-data.js';

export interface MockScanFindingItem {
  id: string;
  idLabel: string;
  title: string;
  summary: string;
  status: MockFindingStatus;
  statusLabel: string;
  isSelected: boolean;
}

export interface MockScanSelectedFinding {
  id: string;
  idLabel: string;
  title: string;
  summary: string;
  rationale: string;
  status: MockFindingStatus;
  statusLabel: string;
  confidenceLabel: string | null;
  remediation: string[];
  checkMarkdown: string;
  evidence: MockFinding['evidence'];
}

export interface MockScanViewModel {
  workspaceName: string;
  workspacePath: string;
  statusKind: MockScanState['statusKind'];
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
  counts: MockScanState['counts'];
  visibleFindingCount: number;
  checksHeading: string;
  sortMode: MockFindingSortMode;
  sortLabel: string;
  items: MockScanFindingItem[];
  selectedFinding: MockScanSelectedFinding | null;
  statusBarText: string;
  statusBarTooltip: string;
  lastScanPath: string;
  warnings: string[];
  canCancel: boolean;
  hasFindings: boolean;
}

export function buildMockScanViewModel(input: {
  state: MockScanState;
  selectedFindingId: string | null;
  sortMode: MockFindingSortMode;
}): MockScanViewModel {
  const {state, selectedFindingId, sortMode} = input;
  const sortedFindings = sortMockFindings(state.findings, sortMode);
  const items = buildFindingItems(sortedFindings, selectedFindingId);
  const selectedFinding = state.findings.find(finding => finding.id === selectedFindingId) ?? null;
  const statusBarText = buildStatusBarText(state);
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

  const statusBarTooltip = statusBarTooltipLines.join('\n');

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
    hasFindings: state.findings.length > 0
  };
}

function buildStatusBarText(state: MockScanState): string {
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

function buildFindingItems(
  findings: MockFinding[],
  selectedFindingId: string | null
): MockScanFindingItem[] {
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

export function formatSortMode(sortMode: MockFindingSortMode): string {
  switch (sortMode) {
    case 'id':
      return 'ID';
    case 'status':
      return 'Status';
    case 'name':
      return 'Name';
  }
}
