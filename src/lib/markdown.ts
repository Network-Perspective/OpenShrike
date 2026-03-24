import type {ScanReport} from './types.js';

export function renderScanReportMarkdown(report: ScanReport): string {
  const lines: string[] = [
    '# OpenShrike Scan Report',
    '',
    `- Bundle: \`${report.bundle_id}\``,
    `- Policy version: \`${report.policy_version}\``,
    `- Repository: \`${report.repo.path}\``,
    `- Summary: total \`${report.summary.total_checks}\`, pass \`${report.summary.passed}\`, fail \`${report.summary.failed}\`, unknown \`${report.summary.unknown}\``,
    '',
    '## Checks',
    ''
  ];

  for (const check of report.checks) {
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

  return lines.join('\n').trimEnd();
}
