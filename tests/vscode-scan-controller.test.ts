import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ScanCommandOptions, ShrikeProjectConfig} from '../src/lib/types.js';

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
  readCheckTitle: vi.fn(),
  resolveCheckDefinitionPath: vi.fn()
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
  createNativeScanSession: vi.fn(),
  runScan: mockRunScan
}));

const {createEmptyScanState} = await import('../src/vscode/mock-data.js');
const {MockExtensionModel} = await import('../src/vscode/mock-model.js');
const {OpenShrikeScanController} = await import('../src/vscode/scan-controller.js');

const tempDirectories: string[] = [];

beforeEach(() => {
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
