import {describe, expect, it} from 'vitest';
import {createScanStateFromResults, formatSelectionLabel} from '../src/vscode/scan-state.js';
import type {CheckResult} from '../src/lib/types.js';

describe('VS Code scan state', () => {
  it('maps live scan results into extension state', () => {
    const checks: CheckResult[] = [
      {
        id: 'bp-sec-001-boundary-input-validation',
        version: '1',
        status: 'fail',
        confidence: 'HIGH',
        evidence: ['src/api/handlers.ts:42'],
        rationale: 'Validation is missing at the request boundary. This allows untrusted data through.',
        remediation: ['Add schema validation before processing request input.']
      }
    ];

    const state = createScanStateFromResults({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace',
      statusKind: 'completed',
      statusLabel: 'Scan complete',
      generatedAt: new Date('2026-05-20T10:00:00.000Z'),
      durationMs: 2100,
      scopeLabel: 'uncommitted changes',
      selectionLabel: 'shared-baseline',
      runtimeMode: 'native',
      parallelism: 'auto',
      totalChecks: 1,
      checks,
      titlesByCheckId: {
        'bp-sec-001-boundary-input-validation': 'Boundary input validation'
      },
      checkMarkdownPathsByCheckId: {
        'bp-sec-001-boundary-input-validation': '/tmp/workspace/.openshrike/checks/bp-sec-001-boundary-input-validation.md'
      },
      activeOperationLabel: 'Scan complete',
      outputLines: ['[10:00:00] scan complete'],
      warnings: [],
      lastScanPath: '/tmp/workspace/.openshrike/last-scan.md',
      canCancel: false
    });

    expect(state.counts.fail).toBe(1);
    expect(state.counts.total).toBe(1);
    expect(state.findings[0]?.title).toBe('Boundary input validation');
    expect(state.findings[0]?.confidence).toBe('high');
    expect(state.findings[0]?.evidence[0]?.location).toBe('src/api/handlers.ts:42');
    expect(state.durationLabel).toBe('2.1s');
    expect(state.runtimeModeLabel).toBe('native');
  });

  it('formats scan selection labels from saved request data', () => {
    expect(formatSelectionLabel({
      checkId: null,
      policyId: 'shared-baseline',
      projectChecksDir: null,
      scanScope: 'uncommitted',
      scanTarget: null,
      runtimeMode: 'native'
    })).toBe('shared-baseline');
  });
});
