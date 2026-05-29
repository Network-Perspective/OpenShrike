import {
  formatConfidence,
  getStatusLabel,
  sortMockFindings,
  type MockFinding,
  type MockFindingSortMode,
  type MockFindingStatus,
  type MockScanState
} from './mock-data.js';

export interface MockScanFindingGroup {
  status: MockFindingStatus;
  label: string;
  count: number;
  items: MockScanFindingItem[];
}

export interface MockScanFindingItem {
  id: string;
  title: string;
  summary: string;
  status: MockFindingStatus;
  statusLabel: string;
  isSelected: boolean;
}

export interface MockScanSelectedFinding {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  status: MockFindingStatus;
  statusLabel: string;
  confidenceLabel: string;
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
  groups: MockScanFindingGroup[];
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
  const groups = buildFindingGroups(sortedFindings, selectedFindingId);
  const selectedFinding = state.findings.find(finding => finding.id === selectedFindingId) ?? null;
  const statusBarText = buildStatusBarText(state);
  const statusBarTooltip = [
    `${state.statusLabel}`,
    `${state.counts.total} total checks`,
    `${state.counts.fail} failed`,
    `${state.counts.unknown} inconclusive`,
    `${state.counts.pass} passed`,
    `Runtime: ${state.runtimeModeLabel}`,
    `Parallelism: ${state.parallelismLabel}`,
    state.canCancel ? 'Click to cancel the active scan.' : 'Click to open the OpenShrike output channel.'
  ].join('\n');

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
    checksHeading: `Checks (${state.counts.visible} of ${state.counts.total})`,
    sortMode,
    sortLabel: formatSortMode(sortMode),
    groups,
    selectedFinding: selectedFinding
      ? {
          id: selectedFinding.id,
          title: selectedFinding.title,
          summary: selectedFinding.summary,
          rationale: selectedFinding.rationale,
          status: selectedFinding.status,
          statusLabel: getStatusLabel(selectedFinding.status),
          confidenceLabel: formatConfidence(selectedFinding.confidence),
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
      return `$(sync~spin) OpenShrike: ${state.counts.visible}/${state.counts.total}`;
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
      return state.counts.total > 0
        ? `$(shield) OpenShrike: ${state.counts.fail} failed`
        : '$(shield) OpenShrike: Ready';
  }
}

function buildFindingGroups(
  findings: MockFinding[],
  selectedFindingId: string | null
): MockScanFindingGroup[] {
  const groups = new Map<MockFindingStatus, MockScanFindingItem[]>();

  for (const status of STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const finding of findings) {
    groups.get(finding.status)?.push({
      id: finding.id,
      title: finding.title,
      summary: finding.summary,
      status: finding.status,
      statusLabel: getStatusLabel(finding.status),
      isSelected: finding.id === selectedFindingId
    });
  }

  return STATUS_ORDER.map(status => ({
    status,
    label: getStatusLabel(status),
    count: groups.get(status)?.length ?? 0,
    items: groups.get(status) ?? []
  }));
}

const STATUS_ORDER: MockFindingStatus[] = ['fail', 'unknown', 'pass'];

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
