import {describe, expect, it} from 'vitest';
import type {CheckResult, ScanReport} from '../src/lib/types.js';
import {
  buildStreamedReport,
  buildScanSections,
  createInitialBrowserState,
  createStreamedReportState,
  formatCheckIdDisplay,
  moveBrowserSelection,
  parseEvidenceLocation,
  reduceStreamedReportState,
  resolveEvidenceWindow,
  syncBrowserState,
  toggleBrowserViewMode
} from '../src/ui/scan-app.js';

describe('buildScanSections', () => {
  it('groups checks in failed, inconclusive, then passed order', () => {
    const report = makeReport([
      ['pass-a', 'pass'],
      ['fail-a', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-b', 'pass'],
      ['fail-b', 'fail']
    ]);

    const sections = buildScanSections(report);

    expect(sections.map(section => section.status)).toEqual(['fail', 'unknown', 'pass']);
    expect(sections[0]?.items.map(check => check.id)).toEqual(['fail-a', 'fail-b']);
    expect(sections[1]?.items.map(check => check.id)).toEqual(['unknown-a']);
    expect(sections[2]?.items.map(check => check.id)).toEqual(['pass-a', 'pass-b']);
  });
});

describe('createInitialBrowserState', () => {
  it('defaults to the first failed check in detail view', () => {
    const state = createInitialBrowserState(makeReport([
      ['fail-a', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]));

    expect(state).toEqual({
      activeStatus: 'fail',
      selectedByStatus: {
        fail: 0,
        unknown: 0,
        pass: 0
      },
      viewMode: 'detail'
    });
  });

  it('falls back to the first non-empty status section', () => {
    const state = createInitialBrowserState(makeReport([
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]));

    expect(state.activeStatus).toBe('unknown');
    expect(state.viewMode).toBe('detail');
  });
});

describe('streamed report state', () => {
  it('collects completed checks into a live incremental report', () => {
    const initial = createStreamedReportState();
    const afterStart = reduceStreamedReportState(initial, makeProgressEvent({
      type: 'check-started',
      checkId: 'fail-a',
      checkStatus: null,
      checkResult: null
    }));
    const afterCompletion = reduceStreamedReportState(afterStart, makeProgressEvent({
      type: 'check-completed',
      checkId: 'fail-a',
      checkStatus: 'fail',
      checkResult: makeCheckResult('fail-a', 'fail')
    }));

    expect(buildStreamedReport(afterStart)).toBeNull();
    expect(buildStreamedReport(afterCompletion)?.checks.map(check => check.id)).toEqual(['fail-a']);
  });

  it('moves browser focus to the first non-empty section while streaming', () => {
    const state = syncBrowserState(createInitialBrowserState(null), makeReport([
      ['pass-a', 'pass']
    ]));

    expect(state.activeStatus).toBe('pass');
    expect(state.viewMode).toBe('detail');
  });
});

describe('moveBrowserSelection', () => {
  it('moves within a section and then to the next section boundary', () => {
    const report = makeReport([
      ['fail-a', 'fail'],
      ['fail-b', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]);
    const sections = buildScanSections(report);

    const afterFirstMove = moveBrowserSelection(createInitialBrowserState(report), sections, 1);
    expect(afterFirstMove.activeStatus).toBe('fail');
    expect(afterFirstMove.selectedByStatus.fail).toBe(1);

    const afterSecondMove = moveBrowserSelection(afterFirstMove, sections, 1);
    expect(afterSecondMove.activeStatus).toBe('unknown');
    expect(afterSecondMove.selectedByStatus.unknown).toBe(0);
  });

  it('moves to the previous section when navigating left from the first item', () => {
    const report = makeReport([
      ['fail-a', 'fail'],
      ['fail-b', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]);
    const sections = buildScanSections(report);
    const state = {
      ...createInitialBrowserState(report),
      activeStatus: 'unknown' as const,
      selectedByStatus: {
        fail: 0,
        unknown: 0,
        pass: 0
      }
    };

    const previous = moveBrowserSelection(state, sections, -1);

    expect(previous.activeStatus).toBe('fail');
    expect(previous.selectedByStatus.fail).toBe(1);
  });
});

describe('toggleBrowserViewMode', () => {
  it('switches between detail and list view', () => {
    const initial = createInitialBrowserState(makeReport([
      ['fail-a', 'fail']
    ]));

    expect(toggleBrowserViewMode(initial).viewMode).toBe('list');
    expect(toggleBrowserViewMode(toggleBrowserViewMode(initial)).viewMode).toBe('detail');
  });
});

describe('formatCheckIdDisplay', () => {
  it('shortens check ids to the uppercase prefix ending in the numeric code', () => {
    expect(formatCheckIdDisplay('bp-sec-004-sensitive-data-not-logged')).toBe('BP-SEC-004');
    expect(formatCheckIdDisplay('csharp-rel-001-cancellation-tokens')).toBe('CSHARP-REL-001');
  });
});

describe('evidence helpers', () => {
  it('parses single-line and ranged evidence references', () => {
    expect(parseEvidenceLocation('src/example.ts:12')).toEqual({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 12
    });
    expect(parseEvidenceLocation('src/example.ts:12:4-13:9')).toEqual({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 13
    });
  });

  it('expands single-line evidence by one line of context and keeps short ranges tight', () => {
    expect(resolveEvidenceWindow({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 12
    }, 100)).toEqual({
      startLine: 11,
      endLine: 13
    });

    expect(resolveEvidenceWindow({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 14
    }, 100)).toEqual({
      startLine: 12,
      endLine: 14
    });
  });

  it('suppresses inline code for evidence spanning more than three lines', () => {
    expect(resolveEvidenceWindow({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 15
    }, 100)).toBeNull();
  });
});

function makeReport(checks: Array<[string, CheckResult['status']]>): Pick<ScanReport, 'checks'> {
  return {
    checks: checks.map(([id, status]) => makeCheckResult(id, status))
  };
}

function makeCheckResult(id: string, status: CheckResult['status']): CheckResult {
  return {
    id,
    version: '0.1.0',
    status,
    confidence: 'HIGH',
    evidence: [],
    rationale: `${id} => ${status}`,
    remediation: []
  };
}

function makeProgressEvent(overrides: Partial<{
  type: 'scope-resolved' | 'no-changes-in-scope' | 'check-started' | 'check-completed';
  checkId: string | null;
  checkStatus: CheckResult['status'] | null;
  checkResult: CheckResult | null;
}> = {}) {
  return {
    type: 'scope-resolved' as const,
    scopeLabel: 'full repository',
    scopeFileCount: 0,
    isFullRepository: true,
    checkId: null,
    workerId: null,
    checkStatus: null,
    checkResult: null,
    passedCount: 0,
    failedCount: 0,
    unknownCount: 0,
    checkIndex: 0,
    completedCount: 0,
    totalChecks: 1,
    runningCheckIds: [],
    ...overrides
  };
}
