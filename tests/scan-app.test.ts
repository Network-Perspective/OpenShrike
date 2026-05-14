import {describe, expect, it} from 'vitest';
import type {CheckResult, ScanReport} from '../src/lib/types.js';
import {
  buildCheckListEntryDisplay,
  buildProgressSegments,
  buildStreamedReport,
  buildScanSections,
  createInitialBrowserState,
  createStreamedReportState,
  deriveProgressCounts,
  findFirstVisibleItemIndex,
  formatCheckListLabel,
  formatCheckIdDisplay,
  formatStatusMarker,
  getScrollPageDelta,
  moveBrowserSelection,
  parseEvidenceLocation,
  reduceStreamedReportState,
  resolveEscapeKeyAction,
  resolveVerticalArrowAction,
  resolveEvidenceWindow,
  resolvePagedListNavigation,
  resolveSummaryStatusLabel,
  resolveVisibleItemScrollOffset,
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
  it('defaults to the first failed check in list view', () => {
    const state = createInitialBrowserState(makeReport([
      ['fail-a', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]));

    expect(state).toEqual({
      selectedCheckIndex: 0,
      viewMode: 'list'
    });
  });

  it('falls back to index 0 when there are no failed checks', () => {
    const state = createInitialBrowserState(makeReport([
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]));

    expect(state.selectedCheckIndex).toBe(0);
    expect(state.viewMode).toBe('list');
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

  it('keeps the selected index in bounds while streaming', () => {
    const initial = {
      ...createInitialBrowserState(null),
      selectedCheckIndex: 7
    };
    const state = syncBrowserState(initial, toDisplayChecks(makeReport([
      ['pass-a', 'pass']
    ])));

    expect(state.selectedCheckIndex).toBe(0);
    expect(state.viewMode).toBe('list');
  });
});

describe('moveBrowserSelection', () => {
  it('moves through the ordered check list', () => {
    const report = makeReport([
      ['fail-a', 'fail'],
      ['fail-b', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]);
    const checks = toDisplayChecks(report);

    const afterFirstMove = moveBrowserSelection(createInitialBrowserState(report), checks, 1);
    expect(afterFirstMove.selectedCheckIndex).toBe(1);

    const afterSecondMove = moveBrowserSelection(afterFirstMove, checks, 1);
    expect(afterSecondMove.selectedCheckIndex).toBe(2);
  });

  it('moves to the previous check when navigating left', () => {
    const report = makeReport([
      ['fail-a', 'fail'],
      ['fail-b', 'fail'],
      ['unknown-a', 'unknown'],
      ['pass-a', 'pass']
    ]);
    const checks = toDisplayChecks(report);
    const state = {
      ...createInitialBrowserState(report),
      selectedCheckIndex: 2
    };

    const previous = moveBrowserSelection(state, checks, -1);

    expect(previous.selectedCheckIndex).toBe(1);
  });
});

describe('toggleBrowserViewMode', () => {
  it('switches between detail and list view', () => {
    const initial = createInitialBrowserState(makeReport([
      ['fail-a', 'fail']
    ]));

    expect(toggleBrowserViewMode(initial).viewMode).toBe('detail');
    expect(toggleBrowserViewMode(toggleBrowserViewMode(initial)).viewMode).toBe('list');
  });
});

describe('formatCheckIdDisplay', () => {
  it('shortens check ids to the uppercase prefix ending in the numeric code', () => {
    expect(formatCheckIdDisplay('bp-sec-004-sensitive-data-not-logged')).toBe('BP-SEC-004');
    expect(formatCheckIdDisplay('csharp-rel-001-cancellation-tokens')).toBe('CSHARP-REL-001');
  });
});

describe('formatCheckListLabel', () => {
  it('renders checks as name followed by the short id in parentheses', () => {
    const check = toDisplayChecks(makeReport([
      ['bp-sec-004-sensitive-data-not-logged', 'fail']
    ]))[0]!;

    expect(formatCheckListLabel(check, {
      'bp-sec-004-sensitive-data-not-logged': 'Sensitive data is not logged'
    })).toBe('Sensitive data is not logged (BP-SEC-004)');
  });
});

describe('formatStatusMarker', () => {
  it('uses the updated pass marker and the running spinner frames', () => {
    expect(formatStatusMarker('pass')).toBe('[v]');
    expect(formatStatusMarker('running', '⠋')).toBe('[⠋]');
    expect(formatStatusMarker('running', '⠏')).toBe('[⠏]');
    expect(formatStatusMarker('fixing', '⠴')).toBe('[⠴]');
    expect(formatStatusMarker('pending')).toBe('[ ]');
  });
});

describe('buildCheckListEntryDisplay', () => {
  it('renders running checks in bright white with the short id after the title', () => {
    const display = buildCheckListEntryDisplay({
      id: 'bp-sec-004-sensitive-data-not-logged',
      status: 'running',
      result: null
    }, {
      'bp-sec-004-sensitive-data-not-logged': 'Sensitive data is not logged'
    }, {
      runningIndicatorFrame: '⠋'
    });

    expect(display).toEqual({
      marker: '[⠋]',
      statusColor: 'whiteBright',
      title: 'Sensitive data is not logged',
      idLabel: 'BP-SEC-004',
      label: 'Sensitive data is not logged (BP-SEC-004)'
    });
  });
});

describe('resolveEscapeKeyAction', () => {
  it('goes back to the list from detail view before exiting', () => {
    expect(resolveEscapeKeyAction({
      showExitConfirm: false,
      showHelp: false,
      viewMode: 'detail',
      isScanComplete: false
    })).toBe('back-to-list');
  });

  it('prompts before exiting while a scan is still running', () => {
    expect(resolveEscapeKeyAction({
      showExitConfirm: false,
      showHelp: false,
      viewMode: 'list',
      isScanComplete: false
    })).toBe('prompt-exit-confirm');
  });

  it('exits directly once the scan is complete', () => {
    expect(resolveEscapeKeyAction({
      showExitConfirm: false,
      showHelp: false,
      viewMode: 'list',
      isScanComplete: true
    })).toBe('exit');
  });
});

describe('resolveVerticalArrowAction', () => {
  it('scrolls in detail view instead of changing the selected check', () => {
    expect(resolveVerticalArrowAction({
      reportReady: true,
      showHelp: false,
      viewMode: 'detail'
    })).toBe('scroll');
  });

  it('navigates between checks in list view when the report is ready', () => {
    expect(resolveVerticalArrowAction({
      reportReady: true,
      showHelp: false,
      viewMode: 'list'
    })).toBe('navigate');
  });

  it('scrolls when help is open or before checks are ready', () => {
    expect(resolveVerticalArrowAction({
      reportReady: true,
      showHelp: true,
      viewMode: 'list'
    })).toBe('scroll');

    expect(resolveVerticalArrowAction({
      reportReady: false,
      showHelp: false,
      viewMode: 'list'
    })).toBe('scroll');
  });
});

describe('deriveProgressCounts', () => {
  it('separates running checks from not-yet-started pending work', () => {
    expect(deriveProgressCounts({
      isScanComplete: false,
      totalChecks: 10,
      completedCount: 4,
      runningCheckIds: ['check-a', 'check-b']
    })).toEqual({
      inProgressCount: 2,
      pendingCount: 4
    });
  });

  it('clears unfinished counts after the scan completes', () => {
    expect(deriveProgressCounts({
      isScanComplete: true,
      totalChecks: 10,
      completedCount: 10,
      runningCheckIds: ['check-a']
    })).toEqual({
      inProgressCount: 0,
      pendingCount: 0
    });
  });
});

describe('resolveSummaryStatusLabel', () => {
  it('prefers action messages over the background progress label', () => {
    expect(resolveSummaryStatusLabel('Scan complete', 'Rechecking check-a...')).toBe('Rechecking check-a...');
  });

  it('falls back to the progress label when there is no action message', () => {
    expect(resolveSummaryStatusLabel('Scan complete', null)).toBe('Scan complete');
  });
});

describe('list scroll helpers', () => {
  it('scrolls the selected row into view above or below the viewport', () => {
    expect(resolveVisibleItemScrollOffset(
      makeScrollMetrics([1, 1, 2, 1], 0, 3),
      2
    )).toBe(1);

    expect(resolveVisibleItemScrollOffset(
      makeScrollMetrics([1, 1, 1, 1], 2, 3),
      0
    )).toBe(0);
  });

  it('finds the first visible row at a target offset', () => {
    expect(findFirstVisibleItemIndex(
      makeScrollMetrics([1, 2, 1, 2, 1], 0, 5),
      5,
      3
    )).toBe(2);
  });

  it('pages the list by the measured viewport height', () => {
    expect(getScrollPageDelta(8)).toBe(5);

    expect(resolvePagedListNavigation({
      metrics: makeScrollMetrics([1, 2, 1, 2, 1, 2], 0, 5),
      itemCount: 6,
      currentIndex: 0,
      direction: 1
    })).toEqual({
      selectedIndex: 2,
      scrollOffset: 3
    });

    expect(resolvePagedListNavigation({
      metrics: makeScrollMetrics([1, 2, 1, 2, 1, 2, 1], 5, 5),
      itemCount: 7,
      currentIndex: 6,
      direction: -1
    })).toEqual({
      selectedIndex: 1,
      scrollOffset: 2
    });
  });
});

describe('buildProgressSegments', () => {
  it('adds a dedicated white segment for checks that are in progress', () => {
    const segments = buildProgressSegments({
      failedCount: 1,
      unknownCount: 1,
      passedCount: 2,
      inProgressCount: 1,
      pendingCount: 1,
      width: 12
    });

    expect(segments.map(segment => segment.key)).toEqual([
      'failed',
      'unknown',
      'passed',
      'running',
      'pending'
    ]);
    expect(segments[3]).toMatchObject({
      key: 'running',
      backgroundColor: 'whiteBright'
    });
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

function toDisplayChecks(report: Pick<ScanReport, 'checks'>) {
  return report.checks.map(check => ({
    id: check.id,
    status: check.status,
    result: check
  }));
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
  type: 'runtime-status' | 'scope-resolved' | 'no-changes-in-scope' | 'check-started' | 'check-completed';
  checkId: string | null;
  checkStatus: CheckResult['status'] | null;
  checkResult: CheckResult | null;
  statusLabel: string;
  detailLines: string[];
}> = {}) {
  return {
    type: 'scope-resolved' as const,
    scopeLabel: 'full repository',
    scopeFileCount: 0,
    isFullRepository: true,
    checkIds: ['check-a'],
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
    statusLabel: 'Scope resolved',
    detailLines: [],
    ...overrides
  };
}

function makeScrollMetrics(heights: number[], scrollOffset: number, viewportHeight: number) {
  const tops: number[] = [];
  let totalHeight = 0;

  for (const height of heights) {
    tops.push(totalHeight);
    totalHeight += height;
  }

  return {
    getItemPosition: (index: number) => {
      if (index < 0 || index >= heights.length) {
        return null;
      }

      return {
        top: tops[index] ?? 0,
        height: heights[index] ?? 0
      };
    },
    getScrollOffset: () => scrollOffset,
    getViewportHeight: () => viewportHeight,
    getBottomOffset: () => Math.max(0, totalHeight - viewportHeight)
  };
}
