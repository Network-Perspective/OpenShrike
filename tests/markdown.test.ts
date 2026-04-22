import {describe, expect, it} from 'vitest';
import {renderScanReportMarkdown} from '../src/lib/markdown.js';
import type {ScanReport} from '../src/lib/types.js';

describe('renderScanReportMarkdown', () => {
  it('renders grouped status sections in fail, unknown, pass order', () => {
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

    const markdown = renderScanReportMarkdown(report);
    expect(markdown).toContain('# OpenShrike Scan Report');
    expect(markdown).toContain('## Failing Checks');
    expect(markdown).toContain('## Unknown Checks');
    expect(markdown).toContain('## Passing Checks');
    expect(markdown).toContain('### `fail-check`');
    expect(markdown).toContain('`src/index.ts:1`');
    expect(markdown.indexOf('## Failing Checks')).toBeLessThan(markdown.indexOf('## Unknown Checks'));
    expect(markdown.indexOf('## Unknown Checks')).toBeLessThan(markdown.indexOf('## Passing Checks'));
    expect(markdown.indexOf('### `fail-check`')).toBeLessThan(markdown.indexOf('### `unknown-check`'));
    expect(markdown.indexOf('### `unknown-check`')).toBeLessThan(markdown.indexOf('### `pass-check`'));
  });
});
