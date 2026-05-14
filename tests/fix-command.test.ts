import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ScanCommandOptions, ScanReport} from '../src/lib/types.js';

const mockResolveScanOptions = vi.fn();
const mockRunScan = vi.fn();
const mockCreateNativeScanSession = vi.fn();
const mockLoadLastScanState = vi.fn();
const mockSaveLastScanState = vi.fn();
const mockFixAndRecheckCheck = vi.fn();

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
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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
