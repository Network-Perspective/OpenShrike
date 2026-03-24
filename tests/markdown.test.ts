import {describe, expect, it} from 'vitest';
import {renderScanReportMarkdown} from '../src/lib/markdown.js';
import type {ScanReport} from '../src/lib/types.js';

describe('renderScanReportMarkdown', () => {
  it('renders report headings and check details', () => {
    const report: ScanReport = {
      bundle_id: 'demo',
      policy_version: '2026-03-24',
      repo: {
        path: '/tmp/demo'
      },
      summary: {
        total_checks: 1,
        passed: 1,
        failed: 0,
        unknown: 0
      },
      checks: [
        {
          id: 'demo-check',
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: ['src/index.ts:1'],
          rationale: 'Looks good.',
          remediation: ['No action required.']
        }
      ]
    };

    const markdown = renderScanReportMarkdown(report);
    expect(markdown).toContain('# OpenShrike Scan Report');
    expect(markdown).toContain('### `demo-check`');
    expect(markdown).toContain('`src/index.ts:1`');
  });
});
