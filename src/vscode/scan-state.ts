import path from 'node:path';
import {formatEvidenceLabel, parseEvidenceLocation} from '../lib/evidence.js';
import type {CheckResult, ParallelismValue, RuntimeMode, SavedScanRequest} from '../lib/types.js';
import type {MockEvidenceItem, MockFinding, MockFindingStatus, MockScanState, MockScanStatusKind} from './mock-data.js';

export function createScanStateFromResults(input: {
  workspaceName: string;
  workspacePath: string;
  statusKind: MockScanStatusKind;
  statusLabel: string;
  generatedAt: Date | null;
  durationMs: number | null;
  tokensLabel?: string;
  scopeLabel: string;
  selectionLabel: string;
  runtimeMode: RuntimeMode | null;
  parallelism: ParallelismValue | null;
  totalChecks: number;
  checkIds: string[];
  checks: CheckResult[];
  runningCheckIds?: string[];
  fixingCheckId?: string | null;
  titlesByCheckId: Record<string, string>;
  checkMarkdownPathsByCheckId: Record<string, string>;
  activeOperationLabel: string;
  outputLines: string[];
  warnings: string[];
  lastScanPath: string;
  canCancel: boolean;
}): MockScanState {
  const resultsByCheckId = new Map(input.checks.map(check => [check.id, check] as const));
  const runningCheckIds = new Set(input.runningCheckIds ?? []);
  const findingIds = dedupeCheckIds([...input.checkIds, ...input.checks.map(check => check.id)]);
  const findings = findingIds.map(checkId => {
    const result = resultsByCheckId.get(checkId) ?? null;
    return buildFinding({
      checkId,
      result,
      status: resolveFindingStatus({
        checkId,
        result,
        runningCheckIds,
        fixingCheckId: input.fixingCheckId ?? null
      })
    }, {
      ...(input.titlesByCheckId[checkId] ? {title: input.titlesByCheckId[checkId]} : {}),
      ...(input.checkMarkdownPathsByCheckId[checkId]
        ? {checkMarkdownPath: input.checkMarkdownPathsByCheckId[checkId]}
        : {})
    });
  });
  const counts = {
    fail: input.checks.filter(check => check.status === 'fail').length,
    unknown: input.checks.filter(check => check.status === 'unknown').length,
    pass: input.checks.filter(check => check.status === 'pass').length,
    pending: findings.filter(finding => finding.status === 'pending').length,
    running: findings.filter(finding => finding.status === 'running').length,
    fixing: findings.filter(finding => finding.status === 'fixing').length,
    completed: resultsByCheckId.size,
    total: input.totalChecks,
    visible: findings.length
  };

  return {
    workspaceName: input.workspaceName,
    workspacePath: input.workspacePath,
    statusKind: input.statusKind,
    statusLabel: input.statusLabel,
    generatedAtLabel: formatGeneratedAtLabel(input.generatedAt),
    targetLabel: truncateMiddle(input.workspacePath, 26),
    durationLabel: formatDurationLabel(input.durationMs),
    tokensLabel: input.tokensLabel ?? 'n/a',
    scopeLabel: input.scopeLabel,
    scanTargetLabel: input.selectionLabel,
    runtimeModeLabel: input.runtimeMode ?? 'configured default',
    parallelismLabel: input.parallelism === null ? 'configured default' : String(input.parallelism),
    counts,
    activeOperationLabel: input.activeOperationLabel,
    findings,
    outputLines: [...input.outputLines],
    lastScanPath: input.lastScanPath,
    warnings: [...input.warnings],
    canCancel: input.canCancel
  };
}

export function formatSelectionLabel(request: SavedScanRequest | null): string {
  if (!request) {
    return 'project defaults';
  }

  if (request.projectChecksDir) {
    return path.basename(request.projectChecksDir);
  }

  return request.checkId ?? request.policyId ?? 'project defaults';
}

function buildFinding(
  input: {
    checkId: string;
    result: CheckResult | null;
    status: MockFindingStatus;
  },
  metadata: {
    title?: string;
    checkMarkdownPath?: string;
  }
): MockFinding {
  const isTransient = input.status === 'pending' || input.status === 'running' || input.status === 'fixing';

  return {
    id: input.checkId,
    title: metadata.title ?? input.checkId,
    status: input.status,
    confidence: input.result
      ? input.result.confidence.toLowerCase() as Exclude<MockFinding['confidence'], null>
      : null,
    summary: isTransient
      ? describeTransientSummary(input.status as Extract<MockFindingStatus, 'pending' | 'running' | 'fixing'>)
      : summarizeRationale(input.result?.rationale ?? ''),
    rationale: input.result?.rationale ?? describeTransientRationale(input.status),
    remediation: [...(input.result?.remediation ?? [])],
    checkMarkdown: metadata.checkMarkdownPath ?? input.checkId,
    evidence: (input.result?.evidence ?? []).map(buildEvidenceItem)
  };
}

function resolveFindingStatus(input: {
  checkId: string;
  result: CheckResult | null;
  runningCheckIds: ReadonlySet<string>;
  fixingCheckId: string | null;
}): MockFindingStatus {
  if (input.checkId === input.fixingCheckId) {
    return 'fixing';
  }

  if (input.runningCheckIds.has(input.checkId)) {
    return 'running';
  }

  return input.result?.status ?? 'pending';
}

function describeTransientSummary(status: Extract<MockFindingStatus, 'pending' | 'running' | 'fixing'>): string {
  switch (status) {
    case 'pending':
      return 'Check is pending execution.';
    case 'running':
      return 'Check is currently running.';
    case 'fixing':
      return 'Check is currently being fixed.';
  }
}

function describeTransientRationale(status: MockFindingStatus): string {
  switch (status) {
    case 'pending':
      return 'Check is pending execution.';
    case 'running':
      return 'Check is pending execution or still running.';
    case 'fixing':
      return 'Check is currently being fixed.';
    case 'fail':
    case 'unknown':
    case 'pass':
      return 'No rationale available.';
  }
}

function buildEvidenceItem(raw: string): MockEvidenceItem {
  const location = parseEvidenceLocation(raw);
  return {
    label: location ? formatEvidenceLabel(location) : raw,
    ...(location ? {location: raw} : {}),
    excerpt: raw,
    raw
  };
}

function summarizeRationale(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'No summary available.';
  }

  const [firstSentence] = trimmed.split(/(?<=[.!?])\s+/u);
  const summary = firstSentence?.trim() || trimmed;
  return summary.length <= 180 ? summary : `${summary.slice(0, 177)}...`;
}

function formatGeneratedAtLabel(value: Date | null): string {
  if (!value) {
    return 'Not yet generated';
  }

  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function formatDurationLabel(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) {
    return 'n/a';
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function dedupeCheckIds(checkIds: readonly string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const checkId of checkIds) {
    if (seen.has(checkId)) {
      continue;
    }

    seen.add(checkId);
    deduped.push(checkId);
  }

  return deduped;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor((maxLength - 3) / 2);
  const tailLength = Math.max(1, maxLength - 3 - headLength);
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}
