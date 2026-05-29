import path from 'node:path';
import {parseEvidenceLocation} from '../lib/evidence.js';
import type {CheckResult, ParallelismValue, RuntimeMode, SavedScanRequest} from '../lib/types.js';
import type {MockEvidenceItem, MockFinding, MockScanState, MockScanStatusKind} from './mock-data.js';

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
  checks: CheckResult[];
  titlesByCheckId: Record<string, string>;
  checkMarkdownPathsByCheckId: Record<string, string>;
  activeOperationLabel: string;
  outputLines: string[];
  warnings: string[];
  lastScanPath: string;
  canCancel: boolean;
}): MockScanState {
  const findings = input.checks.map(check => buildFinding(check, {
    ...(input.titlesByCheckId[check.id] ? {title: input.titlesByCheckId[check.id]} : {}),
    ...(input.checkMarkdownPathsByCheckId[check.id]
      ? {checkMarkdownPath: input.checkMarkdownPathsByCheckId[check.id]}
      : {})
  }));
  const counts = {
    fail: findings.filter(finding => finding.status === 'fail').length,
    unknown: findings.filter(finding => finding.status === 'unknown').length,
    pass: findings.filter(finding => finding.status === 'pass').length,
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
  check: CheckResult,
  metadata: {
    title?: string;
    checkMarkdownPath?: string;
  }
): MockFinding {
  return {
    id: check.id,
    title: metadata.title ?? check.id,
    status: check.status,
    confidence: check.confidence.toLowerCase() as MockFinding['confidence'],
    summary: summarizeRationale(check.rationale),
    rationale: check.rationale,
    remediation: check.remediation,
    checkMarkdown: metadata.checkMarkdownPath ?? check.id,
    evidence: check.evidence.map(buildEvidenceItem)
  };
}

function buildEvidenceItem(raw: string): MockEvidenceItem {
  const location = parseEvidenceLocation(raw);
  return {
    label: location ? formatEvidenceLabel(location.filePath, location.startLine, location.endLine) : raw,
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

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor((maxLength - 3) / 2);
  const tailLength = Math.max(1, maxLength - 3 - headLength);
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}

function formatEvidenceLabel(filePath: string, startLine: number, endLine: number): string {
  return startLine === endLine
    ? `${filePath}:${startLine}`
    : `${filePath}:${startLine}-${endLine}`;
}
