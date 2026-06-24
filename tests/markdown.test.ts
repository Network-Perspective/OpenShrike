import {describe, expect, it} from 'vitest';
import {renderScanReportMarkdown} from '../src/lib/markdown.js';
import type {ScanReport} from '../src/lib/types.js';

describe('renderScanReportMarkdown', () => {
  it('renders collapsed passing and inconclusive checks before failing checks', () => {
    const report: ScanReport = {
      bundle_id: 'demo',
      policy_version: '2026-03-24',
      repo: {
        path: '/tmp/demo'
      },
      summary: {
        total_checks: 3,
        passed: 1,
        failed: 1,
        unknown: 1
      },
      checks: [
        {
          id: 'pass-check',
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: ['src/pass.ts:1'],
          rationale: 'Looks good.',
          remediation: ['No action required.']
        },
        {
          id: 'unknown-check',
          version: '0.1.0',
          status: 'unknown',
          confidence: 'LOW',
          evidence: [],
          rationale: 'Need more evidence.',
          remediation: []
        },
        {
          id: 'fail-check',
          version: '0.1.0',
          status: 'fail',
          confidence: 'HIGH',
          evidence: ['src/index.ts:1'],
          rationale: 'Looks broken.',
          remediation: ['Fix it.']
        },
      ]
    };

    const markdown = renderScanReportMarkdown(report, {
      titlesByCheckId: {
        'pass-check': 'Passing check title',
        'unknown-check': 'Inconclusive check title'
      }
    });
    expect(markdown).toContain('# OpenShrike Scan Report');
    expect(markdown).toContain('## Passing Checks');
    expect(markdown).toContain('## Inconclusive / Not Applicable Checks');
    expect(markdown).toContain('## Failing Checks');
    expect(markdown).toContain('✓ pass-check - Passing check title');
    expect(markdown).not.toContain('### `pass-check`');
    expect(markdown).toContain('? unknown-check - Inconclusive check title');
    expect(markdown).not.toContain('### `unknown-check`');
    expect(markdown).toContain('### `fail-check`');
    expect(markdown).toContain('`src/index.ts:1`');
    expect(markdown.indexOf('## Passing Checks')).toBeLessThan(
      markdown.indexOf('## Inconclusive / Not Applicable Checks')
    );
    expect(markdown.indexOf('## Inconclusive / Not Applicable Checks')).toBeLessThan(
      markdown.indexOf('## Failing Checks')
    );
    expect(markdown.indexOf('? unknown-check - Inconclusive check title')).toBeLessThan(
      markdown.indexOf('### `fail-check`')
    );
  });
});
