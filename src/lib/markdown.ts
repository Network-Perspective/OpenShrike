import {getCheckStatusHeader} from './report.js';
import type {CheckResult, CheckStatus, ScanReport} from './types.js';

const MARKDOWN_CHECK_STATUS_ORDER: readonly CheckStatus[] = ['pass', 'unknown', 'fail'];

export function renderScanReportMarkdown(
  report: ScanReport,
  options: {
    titlesByCheckId?: Readonly<Record<string, string>> | undefined;
  } = {}
): string {
  const lines: string[] = [
    '# OpenShrike Scan Report',
    '',
    `- Bundle: \`${report.bundle_id}\``,
    `- Policy version: \`${report.policy_version}\``,
    `- Repository: \`${report.repo.path}\``,
    `- Summary: total \`${report.summary.total_checks}\`, pass \`${report.summary.passed}\`, fail \`${report.summary.failed}\`, unknown \`${report.summary.unknown}\``,
    ''
  ];

  for (const status of MARKDOWN_CHECK_STATUS_ORDER) {
    const checks = report.checks.filter(check => check.status === status);
    if (checks.length === 0) {
      continue;
    }

    lines.push(`## ${getCheckStatusHeader(status)}`);
    lines.push('');

    const collapsedMarker = getCollapsedCheckMarker(status);
    if (collapsedMarker) {
      for (const check of checks) {
        lines.push(formatCollapsedCheckLine(check, collapsedMarker, options.titlesByCheckId));
      }

      lines.push('');
      continue;
    }

    for (const check of checks) {
      appendExpandedCheck(lines, check);
    }
  }

  return lines.join('\n').trimEnd();
}

function appendExpandedCheck(lines: string[], check: CheckResult): void {
  lines.push(`### \`${check.id}\``);
  lines.push(`- Version: \`${check.version}\``);
  lines.push(`- Status: \`${check.status}\``);
  lines.push(`- Confidence: \`${check.confidence}\``);
  lines.push(`- Rationale: ${check.rationale}`);
  lines.push('- Evidence:');

  if (check.evidence.length === 0) {
    lines.push('  - none');
  } else {
    for (const evidence of check.evidence) {
      lines.push(`  - \`${evidence}\``);
    }
  }

  lines.push('- Remediation:');
  if (check.remediation.length === 0) {
    lines.push('  - none');
  } else {
    for (const remediation of check.remediation) {
      lines.push(`  - ${remediation}`);
    }
  }

  lines.push('');
}

function getCollapsedCheckMarker(status: CheckStatus): string | null {
  switch (status) {
    case 'pass':
      return '✓';
    case 'unknown':
      return '?';
    case 'fail':
      return null;
  }
}

function formatCollapsedCheckLine(
  check: CheckResult,
  marker: string,
  titlesByCheckId: Readonly<Record<string, string>> | undefined
): string {
  const title = titlesByCheckId?.[check.id]?.trim() ?? '';
  return title && title !== check.id
    ? `${marker} ${check.id} - ${title}`
    : `${marker} ${check.id}`;
}
