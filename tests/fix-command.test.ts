import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ScanCommandOptions, ScanReport} from '../src/lib/types.js';

const mockResolveScanOptions = vi.fn();
const mockRunScan = vi.fn();
const mockCreateNativeScanSession = vi.fn();
const mockLoadLastScanState = vi.fn();
const mockSaveLastScanState = vi.fn();
const mockFixAndRecheckCheck = vi.fn();
const mockRunFixWithInk = vi.fn();

vi.mock('../src/lib/markdown.js', () => ({
  renderScanReportMarkdown: vi.fn(() => '# fixed report')
}));

vi.mock('../src/lib/scan-options.js', () => ({
  resolveScanOptions: mockResolveScanOptions
}));

vi.mock('../src/lib/scan.js', () => ({
  createNativeScanSession: mockCreateNativeScanSession,
  runScan: mockRunScan
}));

vi.mock('../src/lib/last-scan.js', () => ({
  createSavedScanRequest: vi.fn((options?: {runtimeMode?: 'native' | 'docker'}) => ({
    checkId: null,
    policyId: 'policy-a',
    projectChecksDir: null,
    scanScope: 'full',
    scanTarget: null,
    runtimeMode: options?.runtimeMode ?? 'native'
  })),
  loadLastScanState: mockLoadLastScanState,
  saveLastScanState: mockSaveLastScanState
}));

vi.mock('../src/lib/fix.js', () => ({
  fixAndRecheckCheck: mockFixAndRecheckCheck,
  updateReportCheck: (report: ScanReport, nextCheck: ScanReport['checks'][number]) => ({
    ...report,
    summary: {
      total_checks: 1,
      passed: nextCheck.status === 'pass' ? 1 : 0,
      failed: nextCheck.status === 'fail' ? 1 : 0,
      unknown: nextCheck.status === 'unknown' ? 1 : 0
    },
    checks: [nextCheck]
  })
}));

class MockScanUiCancelledError extends Error {}

vi.mock('../src/ui/scan-app.js', () => ({
  runFixWithInk: mockRunFixWithInk,
  ScanUiCancelledError: MockScanUiCancelledError
}));

const {executeFixCommand} = await import('../src/commands/fix.js');

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockResolveScanOptions.mockReset();
  mockRunScan.mockReset();
  mockCreateNativeScanSession.mockReset();
  mockLoadLastScanState.mockReset();
  mockSaveLastScanState.mockReset();
  mockFixAndRecheckCheck.mockReset();
  mockRunFixWithInk.mockReset();
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('executeFixCommand', () => {
  it('fixes failing checks sequentially and returns success when all pass', async () => {
    const report = makeReport('fail');
    const fixedReport = makeReport('pass');
    mockResolveScanOptions.mockResolvedValue(makeOptions({policyId: 'policy-a'}));
    mockRunScan.mockResolvedValue(report);
    mockSaveLastScanState.mockResolvedValue([]);
    mockCreateNativeScanSession.mockReturnValue(makeSession(fixedReport));

    const exitCode = await executeFixCommand({repoPath: '.'});

    expect(exitCode).toBe(0);
    expect(mockRunScan).toHaveBeenCalledOnce();
    expect(mockCreateNativeScanSession).toHaveBeenCalledOnce();
    expect(stdoutSpy).toHaveBeenCalledWith('# fixed report\n');
  });

  it('uses saved last-scan state when requested', async () => {
    const report = makeReport('fail');
    const fixedReport = makeReport('pass');
    mockResolveScanOptions.mockResolvedValue(makeOptions({lastScan: true}));
    mockLoadLastScanState.mockResolvedValue({
      state: {
        version: 1,
        savedAt: '2026-05-12T12:00:00.000Z',
        repo: {
          path: '/repo',
          head: null,
          dirty: false
        },
        request: {
          checkId: null,
          policyId: 'policy-a',
          projectChecksDir: null,
          scanScope: 'full',
          scanTarget: null,
          runtimeMode: 'native'
        },
        report
      },
      warnings: ['stale report']
    });
    mockSaveLastScanState.mockResolvedValue([]);
    mockCreateNativeScanSession.mockReturnValue(makeSession(fixedReport));

    const exitCode = await executeFixCommand({repoPath: '.', lastScan: true});

    expect(exitCode).toBe(0);
    expect(mockRunScan).not.toHaveBeenCalled();
    expect(mockCreateNativeScanSession).toHaveBeenCalledOnce();
    expect(stderrSpy).toHaveBeenCalledWith('OpenShrike warning: stale report\n');
  });

  it('uses the docker fix path when the saved request runtime is docker', async () => {
    const report = makeReport('fail');
    const fixedCheck = {
      ...report.checks[0],
      status: 'pass' as const
    };

    mockResolveScanOptions.mockResolvedValue(makeOptions({
      policyId: 'policy-a',
      runtimeMode: 'docker'
    }));
    mockRunScan.mockResolvedValue(report);
    mockSaveLastScanState.mockResolvedValue([]);
    mockFixAndRecheckCheck.mockResolvedValue(fixedCheck);

    const exitCode = await executeFixCommand({
      repoPath: '.',
      runtimeMode: 'docker'
    });

    expect(exitCode).toBe(0);
    expect(mockCreateNativeScanSession).not.toHaveBeenCalled();
    expect(mockFixAndRecheckCheck).toHaveBeenCalledOnce();
    expect(mockFixAndRecheckCheck).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({
        runtimeMode: 'docker'
      })
    }));
    expect(stdoutSpy).toHaveBeenCalledWith('# fixed report\n');
  });

  it('uses the shared Ink dashboard when UI is enabled on a TTY', async () => {
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    setTty(process.stderr, true);
    mockResolveScanOptions.mockResolvedValue(makeOptions({
      policyId: 'policy-a',
      ui: true
    }));
    mockRunFixWithInk.mockResolvedValue({
      report: makeReport('pass'),
      scope: {
        kind: 'full',
        label: 'full repository',
        files: [],
        isFullRepository: true
      }
    });
    mockSaveLastScanState.mockResolvedValue([]);

    try {
      const exitCode = await executeFixCommand({repoPath: '.'});

      expect(exitCode).toBe(0);
      expect(mockRunFixWithInk).toHaveBeenCalledOnce();
      expect(mockRunScan).not.toHaveBeenCalled();
      expect(mockCreateNativeScanSession).not.toHaveBeenCalled();
      expect(mockSaveLastScanState).toHaveBeenCalledWith({
        report: makeReport('pass'),
        request: expect.objectContaining({
          runtimeMode: 'native'
        }),
        scope: {
          kind: 'full',
          label: 'full repository',
          files: [],
          isFullRepository: true
        }
      });
    } finally {
      restoreTty(process.stderr, ttyDescriptor);
    }
  });

  it('passes the loaded report into the Ink dashboard for --last-scan runs', async () => {
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    setTty(process.stderr, true);
    const report = makeReport('fail');
    mockResolveScanOptions.mockResolvedValue(makeOptions({
      lastScan: true,
      ui: true
    }));
    mockLoadLastScanState.mockResolvedValue({
      state: {
        version: 1,
        savedAt: '2026-05-12T12:00:00.000Z',
        repo: {
          path: '/repo',
          head: null,
          dirty: false
        },
        request: {
          checkId: null,
          policyId: 'policy-a',
          projectChecksDir: null,
          scanScope: 'full',
          scanTarget: null,
          runtimeMode: 'native'
        },
        scope: {
          kind: 'full',
          label: 'full repository',
          files: [],
          isFullRepository: true
        },
        report
      },
      warnings: ['stale report']
    });
    mockRunFixWithInk.mockResolvedValue({
      report: makeReport('pass'),
      scope: {
        kind: 'full',
        label: 'full repository',
        files: [],
        isFullRepository: true
      }
    });
    mockSaveLastScanState.mockResolvedValue([]);

    try {
      const exitCode = await executeFixCommand({repoPath: '.', lastScan: true});

      expect(exitCode).toBe(0);
      expect(mockRunFixWithInk).toHaveBeenCalledWith(
        expect.objectContaining({
          lastScan: true,
          ui: true
        }),
        {
          initialReport: report,
          savedRequest: expect.objectContaining({
            runtimeMode: 'native'
          }),
          savedScope: {
            kind: 'full',
            label: 'full repository',
            files: [],
            isFullRepository: true
          }
        }
      );
      expect(mockRunScan).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith('OpenShrike warning: stale report\n');
    } finally {
      restoreTty(process.stderr, ttyDescriptor);
    }
  });

  it('returns 130 when the Ink fix dashboard is cancelled', async () => {
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    setTty(process.stderr, true);
    mockResolveScanOptions.mockResolvedValue(makeOptions({
      policyId: 'policy-a',
      ui: true
    }));
    mockRunFixWithInk.mockRejectedValue(new MockScanUiCancelledError());

    try {
      const exitCode = await executeFixCommand({repoPath: '.'});

      expect(exitCode).toBe(130);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      restoreTty(process.stderr, ttyDescriptor);
    }
  });
});

function makeSession(fixedReport: ScanReport) {
  let currentReport = fixedReport;

  return {
    requestFix: vi.fn(async () => fixedReport.checks[0]),
    getReport: vi.fn(() => currentReport),
    getScope: vi.fn(() => ({
      kind: 'full',
      label: 'full repository',
      files: [],
      isFullRepository: true
    })),
    close: vi.fn(async () => {
      currentReport = fixedReport;
    })
  };
}

function makeOptions(overrides: Partial<ScanCommandOptions>): ScanCommandOptions {
  return {
    checkId: undefined,
    policyId: undefined,
    projectChecksDir: undefined,
    repoPath: '.',
    outputFormat: 'markdown',
    agent: 'shrike-checker',
    model: 'azure/gpt-5.4-mini',
    fixAgent: 'shrike-fixer',
    fixModel: 'azure/gpt-5.4',
    emitBundlePath: undefined,
    scanScope: 'full',
    scanTarget: undefined,
    mockOpencode: false,
    configPath: undefined,
    logPath: undefined,
    runtimeMode: 'native',
    image: undefined,
    artifactsDir: undefined,
    parallelism: 1,
    ui: false,
    lastScan: false,
    ...overrides
  };
}

function makeReport(status: 'pass' | 'fail'): ScanReport {
  return {
    bundle_id: 'policy-a',
    policy_version: '2026-05-12',
    repo: {
      path: '/repo'
    },
    summary: {
      total_checks: 1,
      passed: status === 'pass' ? 1 : 0,
      failed: status === 'fail' ? 1 : 0,
      unknown: 0
    },
    checks: [
      {
        id: 'check-a',
        version: '0.1.0',
        status,
        confidence: 'HIGH',
        evidence: [],
        rationale: 'result',
        remediation: []
      }
    ]
  };
}

function setTty(stream: NodeJS.WriteStream | NodeJS.ReadStream, value: boolean): void {
  Object.defineProperty(stream, 'isTTY', {
    configurable: true,
    value
  });
}

function restoreTty(
  stream: NodeJS.WriteStream | NodeJS.ReadStream,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(stream, 'isTTY', descriptor);
    return;
  }

  delete (stream as {isTTY?: boolean}).isTTY;
}
