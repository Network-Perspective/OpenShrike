import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {SavedLastScanState, ScanCommandOptions, ShrikeProjectConfig} from '../src/lib/types.js';
import type {ScanSessionSnapshot} from '../src/lib/scan.js';

const mockCreateNativeScanSession = vi.fn();
const mockResolveScanOptions = vi.fn();
const mockRunScan = vi.fn();
const mockLoadLastScanState = vi.fn();
const mockResolveLastScanPaths = vi.fn();
const mockSaveLastScanState = vi.fn();

vi.mock('../src/lib/fix.js', () => ({
  fixAndRecheckCheck: vi.fn(),
  recheckSingleCheck: vi.fn(),
  updateReportCheck: vi.fn()
}));

vi.mock('../src/lib/checks.js', () => ({
  getProjectChecksDirectory: vi.fn((repoRoot: string) => path.join(repoRoot, '.openshrike', 'checks')),
  readCheckTitle: vi.fn(),
  resolveCheckDefinitionPath: vi.fn(),
  resolveProjectCheckSelection: vi.fn(async (_projectChecksDir: string, checkId?: string) => ({
    checkIds: checkId ? [checkId] : ['check-a'],
    version: '1'
  }))
}));

vi.mock('../src/lib/last-scan.js', () => ({
  loadLastScanState: mockLoadLastScanState,
  resolveLastScanPaths: mockResolveLastScanPaths,
  saveLastScanState: mockSaveLastScanState
}));

vi.mock('../src/lib/runtime-events.js', () => ({
  createRuntimeStreamState: vi.fn(() => ({items: []})),
  reduceRuntimeEvent: vi.fn((state: {items: Array<{text: string}>}) => state)
}));

vi.mock('../src/lib/scan-options.js', () => ({
  resolveScanOptions: mockResolveScanOptions
}));

vi.mock('../src/lib/scan.js', () => ({
  createNativeScanSession: mockCreateNativeScanSession,
  runScan: mockRunScan
}));

const {createEmptyScanState} = await import('../src/vscode/mock-data.js');
const {MockExtensionModel} = await import('../src/vscode/mock-model.js');
const {OpenShrikeScanController} = await import('../src/vscode/scan-controller.js');

const tempDirectories: string[] = [];

beforeEach(() => {
  mockCreateNativeScanSession.mockReset();
  mockResolveScanOptions.mockReset();
  mockRunScan.mockReset();
  mockLoadLastScanState.mockReset();
  mockResolveLastScanPaths.mockReset();
  mockSaveLastScanState.mockReset();
  mockResolveLastScanPaths.mockResolvedValue({
    markdownPath: '.openshrike/last-scan.md'
  });
  mockSaveLastScanState.mockResolvedValue([]);
});

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('OpenShrike scan controller', () => {
  it('uses configured workspace defaults in the idle state', async () => {
    const workspacePath = await createWorkspace({
      runtime: {
        mode: 'docker',
        parallelism: 4
      },
      scan: {
        scope: 'full'
      }
    });
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);

    const state = model.getState();
    expect(state.statusKind).toBe('idle');
    expect(state.scopeLabel).toBe('full repository');
    expect(state.runtimeModeLabel).toBe('docker');
    expect(state.parallelismLabel).toBe('4');
  });

  it('preloads the configured checks as pending before the first run', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);

    const state = model.getState();
    expect(state.statusKind).toBe('idle');
    expect(state.counts.total).toBe(1);
    expect(state.counts.pending).toBe(1);
    expect(state.findings[0]).toMatchObject({
      id: 'check-a',
      status: 'pending'
    });
  });

  it('remembers the selected scope for future scans in the current session', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);
    await controller.setScopeSelection(workspace, {
      scanScope: 'full',
      scanTarget: null
    });

    mockResolveScanOptions.mockImplementation(async input => makeOptions(workspacePath, {
      runtimeMode: 'docker',
      scanScope: (input as ScanCommandOptions).scanScope ?? 'uncommitted',
      scanTarget: (input as ScanCommandOptions).scanTarget
    }));
    mockRunScan.mockResolvedValue(makeReport(workspacePath, {
      runtimeMode: 'docker'
    }));

    await controller.runScan(workspace);

    expect(mockResolveScanOptions.mock.calls[0]?.[0]).toMatchObject({
      scanScope: 'full'
    });
    expect(model.getState().scopeLabel).toBe('full repository');
  });

  it('persists runtime changes without starting a scan', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);
    await controller.setRuntimeMode(workspace, 'docker');

    const savedProjectConfig = JSON.parse(await fs.readFile(
      path.join(workspacePath, '.openshrike', 'project.json'),
      'utf8'
    )) as ShrikeProjectConfig;

    expect(savedProjectConfig.runtime.mode).toBe('docker');
    expect(model.getState().runtimeModeLabel).toBe('docker');
    expect(model.getState().statusKind).toBe('idle');
  });

  it('marks docker startup failures as failed and clears the cancellable state', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);
    mockResolveScanOptions.mockResolvedValue(makeOptions(workspacePath, {
      runtimeMode: 'docker',
      scanScope: 'full'
    }));
    mockRunScan.mockImplementation(async (_options, hooks) => {
      hooks?.onProgress?.({
        type: 'runtime-status',
        scopeLabel: 'Preparing Docker image (openshrike-runtime:dev)',
        scopeFileCount: 0,
        isFullRepository: false,
        checkIds: [],
        checkId: null,
        workerId: null,
        checkStatus: null,
        checkResult: null,
        passedCount: 0,
        failedCount: 0,
        unknownCount: 0,
        checkIndex: 0,
        completedCount: 0,
        totalChecks: 0,
        runningCheckIds: [],
        statusLabel: 'Preparing Docker image (openshrike-runtime:dev)',
        detailLines: []
      });
      throw new Error('Docker image build failed.');
    });

    await expect(controller.runScan(workspace)).rejects.toThrow('Docker image build failed.');

    const state = model.getState();
    expect(state.statusKind).toBe('failed');
    expect(state.statusLabel).toBe('Docker image build failed.');
    expect(state.activeOperationLabel).toBe('Docker image build failed.');
    expect(state.scopeLabel).toBe('full repository');
    expect(state.runtimeModeLabel).toBe('docker');
    expect(state.canCancel).toBe(false);
    expect(state.outputLines.at(-1)).toContain('Scan failed: Docker image build failed.');
  });

  it('tracks assistant token usage for native scans', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const report = makeReport(workspacePath, {
      runtimeMode: 'native'
    });
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);

    await controller.initialize(workspace);
    mockResolveScanOptions.mockResolvedValue(makeOptions(workspacePath, {
      runtimeMode: 'native',
      scanScope: 'full'
    }));
    mockCreateNativeScanSession.mockImplementation((_options, _initialState, hooks) => ({
      start: async () => {
        hooks?.onRuntimeEvent?.({
          checkId: 'check-a',
          workerId: 'worker-1',
          runtimeMode: 'native',
          event: {
            type: 'message.updated',
            properties: {
              info: {
                id: 'assistant-message-1',
                role: 'assistant',
                tokens: {
                  input: 1234,
                  output: 56
                }
              }
            }
          }
        });

        return report;
      },
      getScope: () => null,
      getReport: () => report,
      getPersistableReport: () => report,
      close: vi.fn().mockResolvedValue(undefined)
    }));

    await controller.runScan(workspace);

    expect(model.getState().tokensLabel).toBe('1.2K / 56');
  });

  it('does not let a stale last-scan restore overwrite live token usage', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const loadedReport = makeReport(workspacePath, {
      runtimeMode: 'native'
    });
    const liveReport = makeReport(workspacePath, {
      runtimeMode: 'native'
    });
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);
    let resolveLoad!: (value: {state: SavedLastScanState; warnings: string[]}) => void;
    let resolveStart!: (value: ReturnType<typeof makeReport>) => void;

    await controller.initialize(workspace);
    mockLoadLastScanState.mockImplementation(
      () => new Promise(resolve => {
        resolveLoad = resolve;
      })
    );
    mockResolveScanOptions.mockResolvedValue(makeOptions(workspacePath, {
      runtimeMode: 'native',
      scanScope: 'full'
    }));
    mockCreateNativeScanSession.mockImplementation((_options, _initialState, hooks) => ({
      start: async () => {
        hooks?.onRuntimeEvent?.({
          checkId: 'check-a',
          workerId: 'worker-1',
          runtimeMode: 'native',
          event: {
            type: 'message.updated',
            properties: {
              info: {
                id: 'assistant-message-1',
                role: 'assistant',
                tokens: {
                  input: 1234,
                  output: 56
                }
              }
            }
          }
        });

        return await new Promise<ReturnType<typeof makeReport>>(resolve => {
          resolveStart = resolve;
        });
      },
      getScope: () => null,
      getReport: () => liveReport,
      getPersistableReport: () => liveReport,
      close: vi.fn().mockResolvedValue(undefined)
    }));

    const loadPromise = controller.loadLastScan(workspace, {
      silentMissing: true
    });
    const runPromise = controller.runScan(workspace);
    await waitForCondition(() => model.getState().tokensLabel === '1.2K / 56');

    resolveLoad({
      state: {
        version: 1,
        savedAt: '2026-05-20T10:00:00.000Z',
        repo: {
          path: workspacePath,
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
        scope: {
          kind: 'full',
          label: 'full repository',
          files: [],
          isFullRepository: true
        },
        report: loadedReport
      },
      warnings: []
    });
    await loadPromise;

    expect(model.getState()).toMatchObject({
      statusKind: 'running',
      tokensLabel: '1.2K / 56',
      canCancel: true
    });

    resolveStart(liveReport);
    await runPromise;
  });

  it('refreshes duration while a scan is running without waiting for progress events', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const report = makeReport(workspacePath, {
      runtimeMode: 'native'
    });
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);
    let resolveStart!: (value: ReturnType<typeof makeReport>) => void;

    await controller.initialize(workspace);
    mockResolveScanOptions.mockResolvedValue(makeOptions(workspacePath, {
      runtimeMode: 'native',
      scanScope: 'full'
    }));
    mockCreateNativeScanSession.mockImplementation(() => ({
      start: () => new Promise<ReturnType<typeof makeReport>>(resolve => {
        resolveStart = resolve;
      }),
      getScope: () => null,
      getReport: () => report,
      getPersistableReport: () => report,
      close: vi.fn().mockResolvedValue(undefined)
    }));

    const runPromise = controller.runScan(workspace);
    await waitForCondition(() => model.getState().canCancel);
    await delay(260);

    expect(Number.parseFloat(model.getState().durationLabel)).toBeGreaterThanOrEqual(0.2);

    resolveStart(report);
    await runPromise;
  });

  it('ignores late native session updates after cancellation completes', async () => {
    const workspacePath = await createWorkspace();
    const workspace = {
      name: 'Workspace',
      path: workspacePath
    };
    const model = new MockExtensionModel(createEmptyScanState({
      workspaceName: workspace.name,
      workspacePath
    }), null);
    const controller = new OpenShrikeScanController(model);
    let rejectStart: ((reason?: unknown) => void) | null = null;
    let latestSnapshotHook: ((snapshot: ScanSessionSnapshot) => void) | undefined;

    await controller.initialize(workspace);
    mockResolveScanOptions.mockResolvedValue(makeOptions(workspacePath, {
      runtimeMode: 'native',
      scanScope: 'full'
    }));
    mockCreateNativeScanSession.mockImplementation((_options, _initialState, hooks) => {
      latestSnapshotHook = hooks?.onUpdate;

      return {
        start: () => new Promise((_, reject) => {
          rejectStart = reject;
        }),
        getScope: () => null,
        getReport: () => null,
        getPersistableReport: () => null,
        close: vi.fn().mockImplementation(async () => {
          rejectStart?.(new Error('Scan session closed.'));
        })
      };
    });

    const runPromise = controller.runScan(workspace);
    await waitForCondition(() => model.getState().canCancel);
    await controller.cancelScan();
    await runPromise;

    latestSnapshotHook?.(makeSessionSnapshot(workspacePath, {
      runningCheckIds: ['check-a'],
      statusLabel: 'Running check-a'
    }));

    const state = model.getState();
    expect(state.statusKind).toBe('cancelled');
    expect(state.statusLabel).toBe('Scan cancelled');
  });
});

async function createWorkspace(overrides: {
  runtime?: Partial<ShrikeProjectConfig['runtime']>;
  scan?: Partial<ShrikeProjectConfig['scan']>;
} = {}): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-controller-'));
  tempDirectories.push(workspacePath);
  await fs.mkdir(path.join(workspacePath, '.openshrike'), {recursive: true});

  const projectConfig: ShrikeProjectConfig = {
    version: 1,
    init: {
      projectType: 'shared',
      detectedFrom: [],
      opencodeSetup: 'existing-config'
    },
    runtime: {
      configPath: '.openshrike/opencode.json',
      scanAgent: 'shrike-checker',
      fixAgent: 'shrike-fixer',
      mode: 'native',
      parallelism: 'auto',
      ...overrides.runtime
    },
    scan: {
      defaultKind: 'check',
      defaultId: 'check-a',
      repo: '.',
      scope: 'uncommitted',
      output: 'markdown',
      ui: false,
      artifactsDir: null,
      ...overrides.scan
    }
  };

  await fs.writeFile(
    path.join(workspacePath, '.openshrike', 'project.json'),
    `${JSON.stringify(projectConfig, null, 2)}\n`,
    'utf8'
  );

  return workspacePath;
}

function makeOptions(
  repoPath: string,
  overrides: Partial<ScanCommandOptions> = {}
): ScanCommandOptions {
  return {
    checkId: 'check-a',
    repoPath,
    outputFormat: 'markdown',
    scanScope: 'uncommitted',
    mockOpencode: false,
    runtimeMode: 'native',
    parallelism: 'auto',
    ui: false,
    ...overrides
  };
}

function makeReport(
  repoPath: string,
  overrides: {
    runtimeMode?: 'native' | 'docker';
  } = {}
) {
  return {
    bundle_id: 'bundle-a',
    policy_version: '1',
    repo: {
      path: repoPath
    },
    execution: {
      runtime_mode: overrides.runtimeMode ?? 'docker',
      requested_parallelism: 'auto' as const,
      effective_parallelism: 1,
      artifacts_dir: null
    },
    summary: {
      total_checks: 1,
      passed: 1,
      failed: 0,
      unknown: 0
    },
    checks: [
      {
        id: 'check-a',
        version: '1',
        status: 'pass' as const,
        confidence: 'HIGH' as const,
        evidence: ['README.md:1'],
        rationale: 'ok',
        remediation: []
      }
    ]
  };
}

function makeSessionSnapshot(
  repoPath: string,
  overrides: Partial<ScanSessionSnapshot> = {}
): ScanSessionSnapshot {
  return {
    request: {
      checkId: 'check-a',
      policyId: null,
      projectChecksDir: null,
      scanScope: 'uncommitted',
      scanTarget: null,
      runtimeMode: 'native'
    },
    repoPath,
    bundleId: 'bundle-a',
    policyVersion: '1',
    checkOrder: ['check-a'],
    resultsByCheckId: {},
    runningCheckIds: [],
    fixingCheckId: null,
    scopeLabel: 'full repository',
    scopeFileCount: 0,
    isFullRepository: true,
    completedCount: 0,
    totalChecks: 1,
    passedCount: 0,
    failedCount: 0,
    unknownCount: 0,
    statusLabel: 'Preparing scan',
    detailLines: [],
    isPrepared: true,
    isScanComplete: false,
    report: null,
    ...overrides
  };
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await delay(10);
  }

  throw new Error('Timed out waiting for test condition.');
}

async function delay(durationMs: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, durationMs);
  });
}
