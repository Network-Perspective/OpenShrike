import {describe, expect, it} from 'vitest';
import {sortChecksByStatus} from '../src/lib/report.js';
import type {CheckResult} from '../src/lib/types.js';

describe('sortChecksByStatus', () => {
  it('orders checks by fail, unknown, then pass while preserving within-group order', () => {
    const checks: CheckResult[] = [
      makeCheckResult('pass-a', 'pass'),
      makeCheckResult('unknown-a', 'unknown'),
      makeCheckResult('fail-a', 'fail'),
      makeCheckResult('pass-b', 'pass'),
      makeCheckResult('fail-b', 'fail'),
      makeCheckResult('unknown-b', 'unknown')
    ];

    expect(sortChecksByStatus(checks).map(check => check.id)).toEqual([
      'fail-a',
      'fail-b',
      'unknown-a',
      'unknown-b',
      'pass-a',
      'pass-b'
    ]);
  });
});

function makeCheckResult(id: string, status: CheckResult['status']): CheckResult {
  return {
    id,
    version: '0.1.0',
    status,
    confidence: 'HIGH',
    evidence: [],
    rationale: `${id} rationale`,
    remediation: []
  };
}
