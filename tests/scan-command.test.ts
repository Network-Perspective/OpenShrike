import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ScanCommandOptions} from '../src/lib/types.js';

const mockResolveScanOptions = vi.fn();
const mockRunScan = vi.fn();
const mockRunScanWithInk = vi.fn();
const mockLoadLastScanState = vi.fn();
const mockSaveLastScanState = vi.fn();

vi.mock('../src/lib/bundle.js', () => ({
  assembleBundleForCheck: vi.fn(),
  assembleBundleForPolicy: vi.fn(),
  assembleBundleForProjectChecks: vi.fn()
}));

vi.mock('../src/lib/markdown.js', () => ({
  renderScanReportMarkdown: vi.fn(() => '# report')
}));

vi.mock('../src/lib/scan-options.js', () => ({
  resolveScanOptions: mockResolveScanOptions
}));

vi.mock('../src/lib/scan.js', () => ({
  runScan: mockRunScan
}));

vi.mock('../src/lib/last-scan.js', () => ({
  createSavedScanRequest: vi.fn(() => ({
    checkId: 'check-a',
    policyId: null,
    projectChecksDir: null,
    scanScope: 'full',
    scanTarget: null,
    runtimeMode: 'native'
  })),
  loadLastScanState: mockLoadLastScanState,
  saveLastScanState: mockSaveLastScanState
}));

class MockScanUiCancelledError extends Error {}

vi.mock('../src/ui/scan-app.js', () => ({
  runScanWithInk: mockRunScanWithInk,
  ScanUiCancelledError: MockScanUiCancelledError
}));

const {executeScanCommand} = await import('../src/commands/scan.js');

const tempDirectories: string[] = [];
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockResolveScanOptions.mockReset();
  mockRunScan.mockReset();
  mockRunScanWithInk.mockReset();
  mockLoadLastScanState.mockReset();
  mockSaveLastScanState.mockReset();
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  writeSpy.mockRestore();
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('executeScanCommand', () => {
  it('renders markdown errors by default when option resolution fails', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-command-'));
    tempDirectories.push(repoRoot);
    mockResolveScanOptions.mockRejectedValue(
      new Error('Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.')
    );

    const exitCode = await executeScanCommand({
      repoPath: repoRoot
    });

    expect(exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('# OpenShrike Error');
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.');
  });

  it('renders json errors when json output is requested before option resolution succeeds', async () => {
    mockResolveScanOptions.mockRejectedValue(
      new Error('Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.')
    );

    const exitCode = await executeScanCommand({
      outputFormat: 'json',
      repoPath: '.'
    });

    expect(exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"error"');
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"code": "INVALID_ARGUMENTS"');
  });

  it('uses the resolved scan output format for runtime failures', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-command-runtime-'));
    tempDirectories.push(repoRoot);
    mockResolveScanOptions.mockResolvedValue(makeOptions(repoRoot, {
      checkId: 'check-a',
      outputFormat: 'json'
    }));
    mockRunScan.mockRejectedValue(new Error('OpenCode runtime failed to start.'));

    const exitCode = await executeScanCommand({
      repoPath: repoRoot
    });

    expect(exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"error"');
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"code": "SCAN_FAILED"');
  });

  it('does not rewrite last-scan state when rendering a saved report', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-command-last-scan-'));
    tempDirectories.push(repoRoot);
    mockResolveScanOptions.mockResolvedValue(makeOptions(repoRoot, {
      checkId: 'check-a',
      lastScan: true
    }));
    mockLoadLastScanState.mockResolvedValue({
      state: {
        version: 1,
        savedAt: '2026-05-12T12:00:00.000Z',
        repo: {
          path: repoRoot,
          head: 'abc123',
          dirty: false
        },
        request: {
          checkId: 'check-a',
          policyId: null,
          projectChecksDir: null,
          scanScope: 'full',
          scanTarget: null,
          runtimeMode: 'native'
        },
        report: {
          bundle_id: 'check-a',
          policy_version: '2026-05-12',
          repo: {path: repoRoot},
          summary: {
            total_checks: 1,
            passed: 0,
            failed: 1,
            unknown: 0
          },
          checks: [
            {
              id: 'check-a',
              version: '0.1.0',
              status: 'fail',
              confidence: 'HIGH',
              evidence: [],
              rationale: 'result',
              remediation: []
            }
          ]
        }
      },
      warnings: ['stale report']
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitCode = await executeScanCommand({
      repoPath: repoRoot,
      lastScan: true
    });

    expect(exitCode).toBe(2);
    expect(mockRunScan).not.toHaveBeenCalled();
    expect(mockSaveLastScanState).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith('OpenShrike warning: stale report\n');
    stderrSpy.mockRestore();
  });
});

function makeOptions(repoPath: string, overrides: Partial<ScanCommandOptions>): ScanCommandOptions {
  return {
    checkId: undefined,
    policyId: undefined,
    repoPath,
    outputFormat: 'markdown',
    agent: undefined,
    model: undefined,
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
    ...overrides
  };
}
