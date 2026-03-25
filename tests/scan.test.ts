import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CHECK_EVALUATION_MAX_ATTEMPTS} from '../src/lib/constants.js';
import type {
  CheckResult,
  ScanCommandOptions,
  ScanProgressEvent,
  ScanRuntimeEvent,
  ScanScopeContext
} from '../src/lib/types.js';

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

vi.mock('../src/lib/evaluator.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/evaluator.js')>('../src/lib/evaluator.js');
  return {
    ...actual,
    evaluateCheck: mockEvaluateCheck
  };
});

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

  it('downgrades inconclusive check errors to unknown and continues other checks', async () => {
    const repoRoot = await makeRepoRoot();
    const {CheckEvaluationError} = await vi.importActual<typeof import('../src/lib/evaluator.js')>('../src/lib/evaluator.js');

    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'typescript-baseline',
      version: '2026-03-23',
      checkIds: ['check-a', 'check-b']
    });
    mockResolveScanScope.mockResolvedValue(makeScope({
      kind: 'uncommitted',
      label: 'uncommitted changes',
      files: ['src/index.ts'],
      isFullRepository: false
    }));
    mockLoadRuntimeConfig.mockResolvedValue({
      configPath: '/tmp/opencode.json',
      config: {},
      requiredEnvVars: [],
      missingEnvVars: []
    });
    mockRuntimeCreate.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined)
    });
    mockRepoGuardCapture.mockResolvedValue({
      throwIfMutated: vi.fn().mockResolvedValue(undefined)
    });
    mockEvaluateCheck.mockImplementation(async ({checkId}: {checkId: string}) => {
      if (checkId === 'check-a') {
        throw new CheckEvaluationError(
          "Agent returned evidence outside scan scope: 'src/lib/cli-error.ts:12'. Allowed scope: uncommitted changes.",
          {
            originalOutput: JSON.stringify({
              id: 'check-a',
              version: '0.1.0',
              status: 'pass',
              confidence: 'HIGH',
              evidence: ['src/lib/cli-error.ts:12'],
              rationale: 'This is the original out-of-scope result.',
              remediation: []
            }, null, 2)
          }
        );
      }

      return makeCheckResult(checkId, 'pass');
    });

    const report = await runScan(makeOptions(repoRoot, {
      policyId: 'typescript-baseline'
    }));

    expect(mockEvaluateCheck).toHaveBeenCalledTimes(CHECK_EVALUATION_MAX_ATTEMPTS + 1);
    expect(report.summary).toEqual({
      total_checks: 2,
      passed: 1,
      failed: 0,
      unknown: 1
    });
    expect(report.checks[0]).toMatchObject({
      id: 'check-a',
      status: 'unknown',
      confidence: 'LOW'
    });
    expect(report.checks[0]?.rationale).toMatch(/Inconclusive result after/i);
    expect(report.checks[0]?.rationale).toContain('"status": "pass"');
    expect(report.checks[0]?.rationale).toContain('"evidence": [');
    expect(report.checks[0]?.rationale).toContain('Original agent result:');
    expect(report.checks[1]).toMatchObject({
      id: 'check-b',
      status: 'pass'
    });
  });

  it('keeps read-only guardrail violations fatal', async () => {
    const repoRoot = await makeRepoRoot();

    mockResolveScanScope.mockResolvedValue(makeScope({}));
    mockLoadRuntimeConfig.mockResolvedValue({
      configPath: '/tmp/opencode.json',
      config: {},
      requiredEnvVars: [],
      missingEnvVars: []
    });
    mockRuntimeCreate.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined)
    });
    mockRepoGuardCapture.mockResolvedValue({
      throwIfMutated: vi.fn().mockRejectedValue(new Error('Read-only guardrail violation: agent execution modified repository files.'))
    });
    mockEvaluateCheck.mockResolvedValue(makeCheckResult('check-a', 'pass'));

    await expect(runScan(makeOptions(repoRoot, {
      checkId: 'check-a'
    }))).rejects.toThrow(/Read-only guardrail violation/i);
  });

  it('routes runtime events with check and worker metadata', async () => {
    const repoRoot = await makeRepoRoot();
    let capturedRuntimeEvent:
      | ((event: {event: {type: string; properties: Record<string, unknown>}; checkId: string | null; workerId: string | null; sessionId: string | null}) => void)
      | undefined;

    mockResolveScanScope.mockResolvedValue(makeScope({}));
    mockLoadRuntimeConfig.mockResolvedValue({
      configPath: '/tmp/opencode.json',
      config: {},
      requiredEnvVars: [],
      missingEnvVars: []
    });
    mockRuntimeCreate.mockImplementation(async options => {
      capturedRuntimeEvent = options.onEvent;
      return {
        close: vi.fn().mockResolvedValue(undefined)
      };
    });
    mockRepoGuardCapture.mockResolvedValue({
      throwIfMutated: vi.fn().mockResolvedValue(undefined)
    });
    mockEvaluateCheck.mockImplementation(async () => {
      capturedRuntimeEvent?.({
        sessionId: 'session-1',
        checkId: 'check-a',
        workerId: 'worker-1',
        event: {
          type: 'session.status',
          properties: {
            sessionID: 'session-1',
            status: {
              type: 'running'
            }
          }
        }
      });
      return makeCheckResult('check-a', 'pass');
    });

    const runtimeEvents: ScanRuntimeEvent[] = [];
    await runScan(makeOptions(repoRoot, {checkId: 'check-a'}), {
      onRuntimeEvent: event => runtimeEvents.push(event)
    });

    expect(runtimeEvents).toHaveLength(1);
    expect(runtimeEvents[0]).toMatchObject({
      checkId: 'check-a',
      workerId: 'worker-1',
      runtimeMode: 'native'
    });
    expect(runtimeEvents[0]?.event.type).toBe('session.status');
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
    runtimeMode: 'native',
    image: undefined,
    artifactsDir: undefined,
    parallelism: 1,
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
