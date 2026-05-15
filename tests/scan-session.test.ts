import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {CheckResult, ScanCommandOptions} from '../src/lib/types.js';

const mockResolvePolicyDefinition = vi.fn();
const mockResolveScanScope = vi.fn();
const mockEvaluateCheck = vi.fn();
const mockLoadRuntimeConfig = vi.fn();
const mockCreateRuntime = vi.fn();
const mockCreateScanLogger = vi.fn();
const mockRunFixForCheck = vi.fn();
let repoRoot = '';

vi.mock('../src/lib/policies.js', () => ({
  resolvePolicyDefinition: mockResolvePolicyDefinition
}));

vi.mock('../src/lib/scope.js', () => ({
  resolveScanScope: mockResolveScanScope
}));

vi.mock('../src/lib/evaluator.js', () => ({
  CheckEvaluationError: class CheckEvaluationError extends Error {},
  evaluateCheck: mockEvaluateCheck,
  getCheckEvaluationOriginalOutput: vi.fn(() => null)
}));

vi.mock('../src/lib/config.js', () => ({
  getDefaultConfigPath: vi.fn(() => '/repo/.openshrike/opencode.json'),
  loadRuntimeConfig: mockLoadRuntimeConfig
}));

vi.mock('../src/lib/runtime.js', () => ({
  OpenCodeRuntime: {
    create: mockCreateRuntime
  }
}));

vi.mock('../src/lib/scan-log.js', () => ({
  createScanLogger: mockCreateScanLogger
}));

vi.mock('../src/lib/repo-guard.js', () => ({
  RepoMutationGuard: {
    capture: vi.fn(async () => ({
      throwIfMutated: vi.fn(async () => undefined)
    }))
  }
}));

vi.mock('../src/lib/fix-runtime.js', () => ({
  runFixForCheck: mockRunFixForCheck
}));

const {createNativeScanSession} = await import('../src/lib/scan.js');

afterEach(async () => {
  if (repoRoot) {
    await fs.rm(repoRoot, {recursive: true, force: true});
    repoRoot = '';
  }
});

beforeEach(async () => {
  mockResolvePolicyDefinition.mockReset();
  mockResolveScanScope.mockReset();
  mockEvaluateCheck.mockReset();
  mockLoadRuntimeConfig.mockReset();
  mockCreateRuntime.mockReset();
  mockCreateScanLogger.mockReset();
  mockRunFixForCheck.mockReset();

  repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-session-'));
  mockResolveScanScope.mockResolvedValue({
    kind: 'full',
    label: 'Full repository',
    files: [],
    isFullRepository: true
  });
  mockLoadRuntimeConfig.mockResolvedValue({
    config: {},
    configPath: '/repo/.openshrike/opencode.json',
    requiredEnvVars: [],
    missingEnvVars: []
  });
  mockCreateRuntime.mockResolvedValue({
    close: vi.fn(async () => undefined)
  });
  mockCreateScanLogger.mockResolvedValue({
    path: null,
    write: vi.fn(),
    close: vi.fn(async () => undefined)
  });
  mockRunFixForCheck.mockResolvedValue(undefined);
});

describe('createNativeScanSession', () => {
  it('drains active reads before fixing and resumes queued scan work after recheck', async () => {
    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'policy-a',
      version: '2026-05-12',
      checkIds: ['check-a', 'check-b', 'check-c']
    });

    const sequence: string[] = [];
    const firstCheck = deferred<CheckResult>();
    const secondCheck = deferred<CheckResult>();
    const firstScanStarted = deferred<void>();
    const secondScanStarted = deferred<void>();
    mockEvaluateCheck.mockImplementation(async ({checkId}: {checkId: string}) => {
      sequence.push(`scan:${checkId}`);
      if (checkId === 'check-a' && sequence.filter(step => step === 'scan:check-a').length === 1) {
        firstScanStarted.resolve();
        return await firstCheck.promise;
      }

      if (checkId === 'check-b') {
        secondScanStarted.resolve();
        return await secondCheck.promise;
      }

      return makeResult(checkId, 'pass');
    });
    mockRunFixForCheck.mockImplementation(async ({check}: {check: CheckResult}) => {
      sequence.push(`fix:${check.id}`);
    });

    const updates = createSnapshotUpdates();
    const session = createNativeScanSession(makeOptions(), undefined, {
      onUpdate: updates.onUpdate
    });
    const completion = session.start();

    await firstScanStarted.promise;
    expect(sequence).toEqual(['scan:check-a']);

    firstCheck.resolve(makeResult('check-a', 'fail'));
    await secondScanStarted.promise;
    expect(sequence).toEqual(['scan:check-a', 'scan:check-b']);

    const fixPromise = session.requestFix('check-a');
    await updates.waitFor(snapshot => snapshot.fixingCheckId === 'check-a');
    expect(sequence).toEqual(['scan:check-a', 'scan:check-b']);

    secondCheck.resolve(makeResult('check-b', 'pass'));
    await fixPromise;
    const finalReport = await completion;

    expect(sequence).toEqual([
      'scan:check-a',
      'scan:check-b',
      'fix:check-a',
      'scan:check-a',
      'scan:check-c'
    ]);
    expect(finalReport.summary.failed).toBe(0);

    await session.close();
  });

  it('queues a single-check recheck without rescanning the remaining completed checks', async () => {
    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'policy-a',
      version: '2026-05-12',
      checkIds: ['check-a', 'check-b']
    });

    const sequence: string[] = [];
    const firstCheck = deferred<CheckResult>();
    const secondCheck = deferred<CheckResult>();
    const firstScanStarted = deferred<void>();
    const secondScanStarted = deferred<void>();
    mockEvaluateCheck.mockImplementation(async ({checkId}: {checkId: string}) => {
      sequence.push(`scan:${checkId}`);
      if (checkId === 'check-a' && sequence.filter(step => step === 'scan:check-a').length === 1) {
        firstScanStarted.resolve();
        return await firstCheck.promise;
      }

      if (checkId === 'check-b') {
        secondScanStarted.resolve();
        return await secondCheck.promise;
      }

      return makeResult('check-a', 'pass');
    });

    const session = createNativeScanSession(makeOptions());
    const completion = session.start();

    await firstScanStarted.promise;
    expect(sequence).toEqual(['scan:check-a']);
    firstCheck.resolve(makeResult('check-a', 'fail'));
    await secondScanStarted.promise;
    expect(sequence).toEqual(['scan:check-a', 'scan:check-b']);

    const recheckPromise = session.requestRecheck('check-a');
    expect(sequence).toEqual(['scan:check-a', 'scan:check-b']);

    secondCheck.resolve(makeResult('check-b', 'pass'));
    const rechecked = await recheckPromise;
    const finalReport = await completion;

    expect(rechecked.status).toBe('pass');
    expect(sequence).toEqual(['scan:check-a', 'scan:check-b', 'scan:check-a']);
    expect(finalReport.summary.failed).toBe(0);

    await session.close();
  });

  it('builds a persistable report snapshot while checks are still pending', async () => {
    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'policy-a',
      version: '2026-05-12',
      checkIds: ['check-a', 'check-b']
    });

    const firstCheck = deferred<CheckResult>();
    mockEvaluateCheck.mockImplementation(async ({checkId}: {checkId: string}) => {
      if (checkId === 'check-a') {
        return await firstCheck.promise;
      }

      return makeResult(checkId, 'pass');
    });

    const updates = createSnapshotUpdates();
    const session = createNativeScanSession(makeOptions(), undefined, {
      onUpdate: updates.onUpdate
    });
    const completion = session.start();

    const runningSnapshot = await updates.waitFor(
      snapshot => snapshot.runningCheckIds.includes('check-a')
    );
    expect(runningSnapshot.runningCheckIds).toEqual(['check-a']);
    expect(session.getSnapshot().runningCheckIds).toEqual(['check-a']);
    const savedReport = session.getPersistableReport();
    expect(savedReport?.summary.total_checks).toBe(2);
    expect(savedReport?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({id: 'check-a', status: 'unknown'}),
      expect.objectContaining({id: 'check-b', status: 'unknown'})
    ]));

    firstCheck.resolve(makeResult('check-a', 'fail'));

    await completion;
    await session.close();
  });

  it('fails early with a clear message when uncommitted scope has no changes', async () => {
    mockResolvePolicyDefinition.mockResolvedValue({
      id: 'policy-a',
      version: '2026-05-12',
      checkIds: ['check-a', 'check-b']
    });
    mockResolveScanScope.mockResolvedValue({
      kind: 'uncommitted',
      label: 'uncommitted changes',
      files: [],
      isFullRepository: false
    });

    const updates = createSnapshotUpdates();
    const session = createNativeScanSession(makeOptions({scanScope: 'uncommitted'}), undefined, {
      onUpdate: updates.onUpdate
    });

    await expect(session.start()).rejects.toMatchObject({
      code: 'NO_CHANGES_IN_SCOPE',
      message: 'There are no uncommitted changes in the current folder.'
    });

    const snapshot = await updates.waitFor(
      nextSnapshot => nextSnapshot.statusLabel === 'There are no uncommitted changes in the current folder'
    );
    expect(snapshot.isPrepared).toBe(true);
    expect(snapshot.isScanComplete).toBe(false);
    expect(snapshot.runningCheckIds).toEqual([]);
    expect(mockEvaluateCheck).not.toHaveBeenCalled();
    expect(mockLoadRuntimeConfig).not.toHaveBeenCalled();

    await session.close();
  });

  it('reuses the saved scope files for rechecks from a restored session', async () => {
    const savedScope = {
      kind: 'uncommitted' as const,
      label: 'uncommitted changes',
      files: ['src/a.ts', 'tests/a.test.ts'],
      isFullRepository: false
    };
    mockEvaluateCheck.mockImplementation(async ({scopeContext}: {scopeContext: {files: string[]}}) => {
      expect(scopeContext.files).toEqual(savedScope.files);
      return makeResult('check-a', 'pass');
    });

    const session = createNativeScanSession(
      makeOptions({scanScope: 'uncommitted'}),
      {
        initialReport: {
          bundle_id: 'check-a',
          policy_version: '2026-05-12',
          repo: {
            path: '/repo'
          },
          summary: {
            total_checks: 1,
            passed: 0,
            failed: 1,
            unknown: 0
          },
          checks: [makeResult('check-a', 'fail')]
        },
        savedRequest: {
          checkId: 'check-a',
          policyId: null,
          projectChecksDir: null,
          scanScope: 'uncommitted',
          scanTarget: null,
          runtimeMode: 'native'
        },
        savedScope
      }
    );

    const rechecked = await session.requestRecheck('check-a');

    expect(rechecked.status).toBe('pass');
    expect(mockResolveScanScope).not.toHaveBeenCalled();

    await session.close();
  });
});

function makeOptions(overrides: Partial<ScanCommandOptions> = {}): ScanCommandOptions {
  return {
    checkId: undefined,
    policyId: 'policy-a',
    projectChecksDir: undefined,
    repoPath: repoRoot,
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

function makeResult(id: string, status: 'pass' | 'fail'): CheckResult {
  return {
    id,
    version: '0.1.0',
    status,
    confidence: 'HIGH',
    evidence: [],
    rationale: status,
    remediation: []
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function createSnapshotUpdates() {
  let latestSnapshot: ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']> | null = null;
  const waiters: Array<{
    predicate: (snapshot: ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']>) => boolean;
    resolve: (snapshot: ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']>) => void;
    reject: (error: unknown) => void;
  }> = [];

  return {
    onUpdate(snapshot: ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']>) {
      latestSnapshot = snapshot;
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        const waiter = waiters[index];
        if (!waiter) {
          continue;
        }

        try {
          if (waiter.predicate(snapshot)) {
            waiters.splice(index, 1);
            waiter.resolve(snapshot);
          }
        } catch (error) {
          waiters.splice(index, 1);
          waiter.reject(error);
        }
      }
    },
    async waitFor(
      predicate: (snapshot: ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']>) => boolean
    ) {
      if (latestSnapshot && predicate(latestSnapshot)) {
        return latestSnapshot;
      }

      return await new Promise<ReturnType<ReturnType<typeof createNativeScanSession>['getSnapshot']>>((resolve, reject) => {
        waiters.push({predicate, resolve, reject});
      });
    }
  };
}
