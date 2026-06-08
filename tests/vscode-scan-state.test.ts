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
      checkIds: ['bp-sec-001-boundary-input-validation'],
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

  it('keeps pending and in-progress checks visible before they return results', () => {
    const state = createScanStateFromResults({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace',
      statusKind: 'running',
      statusLabel: 'Running bp-sec-001-boundary-input-validation',
      generatedAt: null,
      durationMs: 900,
      scopeLabel: 'uncommitted changes',
      selectionLabel: 'shared-baseline',
      runtimeMode: 'native',
      parallelism: 'auto',
      totalChecks: 3,
      checkIds: [
        'bp-sec-001-boundary-input-validation',
        'bp-rel-002-retries-are-bounded-and-safe',
        'bp-test-001-behavior-changes-covered'
      ],
      checks: [
        {
          id: 'bp-sec-001-boundary-input-validation',
          version: '1',
          status: 'fail',
          confidence: 'HIGH',
          evidence: [],
          rationale: 'Validation is missing at the request boundary.',
          remediation: []
        }
      ],
      runningCheckIds: ['bp-rel-002-retries-are-bounded-and-safe'],
      titlesByCheckId: {
        'bp-sec-001-boundary-input-validation': 'Boundary input validation',
        'bp-rel-002-retries-are-bounded-and-safe': 'Retries are bounded and safe',
        'bp-test-001-behavior-changes-covered': 'Behavior changes are covered'
      },
      checkMarkdownPathsByCheckId: {},
      activeOperationLabel: 'Running bp-rel-002-retries-are-bounded-and-safe',
      outputLines: [],
      warnings: [],
      lastScanPath: '/tmp/workspace/.openshrike/last-scan.md',
      canCancel: true
    });

    expect(state.findings.map(finding => [finding.id, finding.status])).toEqual([
      ['bp-sec-001-boundary-input-validation', 'fail'],
      ['bp-rel-002-retries-are-bounded-and-safe', 'running'],
      ['bp-test-001-behavior-changes-covered', 'pending']
    ]);
    expect(state.counts.completed).toBe(1);
    expect(state.counts.running).toBe(1);
    expect(state.counts.pending).toBe(1);
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
