import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {CheckResult, ScanCommandOptions, ScanProgressEvent, ScanScopeContext} from '../src/lib/types.js';

const mockLoadRuntimeConfig = vi.fn();
const mockEvaluateCheck = vi.fn();
const mockResolvePolicyDefinition = vi.fn();
const mockResolveScanScope = vi.fn();
const mockRuntimeCreate = vi.fn();
const mockRepoGuardCapture = vi.fn();

vi.mock('../src/lib/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/config.js')>('../src/lib/config.js');
  return {
    ...actual,
    loadRuntimeConfig: mockLoadRuntimeConfig
  };
});

vi.mock('../src/lib/evaluator.js', () => ({
  evaluateCheck: mockEvaluateCheck
}));

vi.mock('../src/lib/policies.js', () => ({
  resolvePolicyDefinition: mockResolvePolicyDefinition
}));

vi.mock('../src/lib/runtime.js', () => ({
  OpenCodeRuntime: {
    create: mockRuntimeCreate
  }
}));

vi.mock('../src/lib/scope.js', () => ({
  resolveScanScope: mockResolveScanScope
}));

vi.mock('../src/lib/repo-guard.js', () => ({
  RepoMutationGuard: {
    capture: mockRepoGuardCapture
  }
}));

const {runScan} = await import('../src/lib/scan.js');

const tempRoots: string[] = [];

describe('runScan', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, {recursive: true, force: true})));
  });

  it('returns unknown results when no files match a non-full scope', async () => {
    const repoRoot = await makeRepoRoot();
    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'typescript-baseline',
      version: '2026-03-23',
      checkIds: ['check-a', 'check-b']
    });
    mockResolveScanScope.mockResolvedValue(
      makeScope({
        kind: 'branch',
        label: 'branch main',
        files: [],
        isFullRepository: false
      })
    );

    const progress: ScanProgressEvent[] = [];
    const report = await runScan(
      makeOptions(repoRoot, {
        policyId: 'typescript-baseline',
        scanScope: 'branch',
        scanTarget: 'origin/main',
        mockOpencode: true
      }),
      {
        onProgress: event => progress.push(event)
      }
    );

    expect(report.summary).toEqual({
      total_checks: 2,
      passed: 0,
      failed: 0,
      unknown: 2
    });
    expect(report.checks.map(check => check.status)).toEqual(['unknown', 'unknown']);
    expect(progress.map(event => event.type)).toEqual(['scope-resolved', 'no-changes-in-scope']);
    expect(mockEvaluateCheck).not.toHaveBeenCalled();
  });

  it('runs checks and emits progress for a normal scan', async () => {
    const repoRoot = await makeRepoRoot();
    const runtime = {
      close: vi.fn().mockResolvedValue(undefined)
    };

    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'typescript-baseline',
      version: '2026-03-23',
      checkIds: ['check-a', 'check-b']
    });
    mockResolveScanScope.mockResolvedValue(makeScope({}));
    mockLoadRuntimeConfig.mockResolvedValue({
      configPath: '/tmp/opencode.json',
      config: {},
      requiredEnvVars: [],
      missingEnvVars: []
    });
    mockRuntimeCreate.mockResolvedValue(runtime);
    mockRepoGuardCapture.mockResolvedValue({
      throwIfMutated: vi.fn().mockResolvedValue(undefined)
    });
    mockEvaluateCheck
      .mockResolvedValueOnce(makeCheckResult('check-a', 'pass'))
      .mockResolvedValueOnce(makeCheckResult('check-b', 'fail'));

    const progress: ScanProgressEvent[] = [];
    const report = await runScan(makeOptions(repoRoot, {policyId: 'typescript-baseline'}), {
      onProgress: event => progress.push(event)
    });

    expect(mockRuntimeCreate).toHaveBeenCalledOnce();
    expect(mockEvaluateCheck).toHaveBeenCalledTimes(2);
    expect(runtime.close).toHaveBeenCalledOnce();
    expect(report.summary).toEqual({
      total_checks: 2,
      passed: 1,
      failed: 1,
      unknown: 0
    });
    expect(progress.map(event => event.type)).toEqual([
      'scope-resolved',
      'check-started',
      'check-completed',
      'check-started',
      'check-completed'
    ]);
  });
});

async function makeRepoRoot(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-'));
  tempRoots.push(repoRoot);
  return repoRoot;
}

function makeOptions(repoPath: string, overrides: Partial<ScanCommandOptions>): ScanCommandOptions {
  return {
    checkId: undefined,
    policyId: undefined,
    repoPath,
    outputFormat: 'json',
    agent: undefined,
    model: undefined,
    emitBundlePath: undefined,
    scanScope: 'full',
    scanTarget: undefined,
    mockOpencode: false,
    configPath: undefined,
    logPath: undefined,
    ui: false,
    ...overrides
  };
}

function makeScope(overrides: Partial<ScanScopeContext>): ScanScopeContext {
  return {
    kind: 'full',
    label: 'full repository',
    files: [],
    isFullRepository: true,
    ...overrides
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
