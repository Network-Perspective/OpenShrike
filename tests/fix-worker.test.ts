import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DOCKER_RUNTIME_CONFIG_ENV} from '../src/lib/constants.js';

const {
  mockCreateRuntime,
  mockRunFixForCheck,
  mockResolveScanScope,
  mockCreateScanLogger
} = vi.hoisted(() => ({
  mockCreateRuntime: vi.fn(),
  mockRunFixForCheck: vi.fn(),
  mockResolveScanScope: vi.fn(),
  mockCreateScanLogger: vi.fn()
}));

vi.mock('../src/lib/runtime.js', () => ({
  OpenCodeRuntime: {
    create: mockCreateRuntime
  }
}));

vi.mock('../src/lib/fix-runtime.js', () => ({
  runFixForCheck: mockRunFixForCheck
}));

vi.mock('../src/lib/scope.js', () => ({
  resolveScanScope: mockResolveScanScope
}));

vi.mock('../src/lib/scan-log.js', () => ({
  createScanLogger: mockCreateScanLogger
}));

const {executeInternalFixWorkerCommand} = await import('../src/commands/fix-worker.js');

const tempDirectories: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

afterEach(async () => {
  delete process.env[DOCKER_RUNTIME_CONFIG_ENV];
  stdoutSpy.mockRestore();
  await Promise.all(
    tempDirectories.splice(0).reverse().map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

beforeEach(() => {
  mockCreateRuntime.mockReset();
  mockRunFixForCheck.mockReset();
  mockResolveScanScope.mockReset();
  mockCreateScanLogger.mockReset();

  mockResolveScanScope.mockResolvedValue({
    kind: 'full',
    label: 'full repository',
    files: [],
    isFullRepository: true
  });
  mockRunFixForCheck.mockResolvedValue(undefined);
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('executeInternalFixWorkerCommand', () => {
  it('runs the docker fix worker with a resolved scope and forwards runtime events into the log and stdout', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-fix-worker-'));
    tempDirectories.push(tempRoot);

    const logger = {
      path: path.join(tempRoot, 'fix.log.jsonl'),
      write: vi.fn(),
      close: vi.fn(async () => undefined)
    };
    const runtime = {
      close: vi.fn(async () => undefined)
    };
    mockCreateScanLogger.mockResolvedValue(logger);
    mockCreateRuntime.mockResolvedValue(runtime);

    const requestPath = path.join(tempRoot, 'fix-request.json');
    const logPath = path.join(tempRoot, 'logs', 'fix.log.jsonl');
    await fs.writeFile(
      requestPath,
      `${JSON.stringify({
        repoPath: '/workspace/repo',
        projectChecksDir: '/workspace/repo/.openshrike/checks',
        logPath,
        request: {
          checkId: null,
          policyId: 'policy-a',
          projectChecksDir: '/workspace/repo/.openshrike/checks',
          scanScope: 'full',
          scanTarget: null,
          runtimeMode: 'docker'
        },
        check: {
          id: 'check-a',
          version: '0.1.0',
          status: 'fail',
          confidence: 'HIGH',
          evidence: ['src/example.ts:1'],
          rationale: 'broken',
          remediation: ['fix it']
        },
        agent: 'shrike-fixer',
        model: 'azure/gpt-5.4',
        emulateOpencode: false
      }, null, 2)}\n`,
      'utf8'
    );

    process.env[DOCKER_RUNTIME_CONFIG_ENV] = Buffer.from('{}', 'utf8').toString('base64');

    const exitCode = await executeInternalFixWorkerCommand({requestPath});

    expect(exitCode).toBe(0);
    expect(mockCreateScanLogger).toHaveBeenCalledWith(path.resolve(logPath));
    expect(mockCreateRuntime).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: '/workspace/repo',
      logger
    }));
    expect(mockResolveScanScope).toHaveBeenCalledWith('/workspace/repo', 'full', undefined);
    expect(mockRunFixForCheck).toHaveBeenCalledWith(expect.objectContaining({
      check: expect.objectContaining({
        id: 'check-a'
      }),
      request: expect.objectContaining({
        runtimeMode: 'docker'
      }),
      repoPath: '/workspace/repo',
      runtime,
      emulateOpencode: false,
      scopeContext: {
        kind: 'full',
        label: 'full repository',
        files: [],
        isFullRepository: true
      }
    }));

    const runtimeOptions = mockCreateRuntime.mock.calls[0]?.[0];
    expect(typeof runtimeOptions?.onEvent).toBe('function');
    runtimeOptions?.onEvent?.({
      event: {
        type: 'session.status',
        properties: {
          sessionID: 'ses_fix_123',
          status: {
            type: 'busy'
          }
        }
      },
      sessionId: 'ses_fix_123',
      checkId: 'check-a',
      workerId: 'worker-1'
    });

    expect(logger.write).toHaveBeenCalledWith('opencode.event', expect.objectContaining({
      type: 'session.status',
      sessionID: 'ses_fix_123',
      status: 'busy',
      checkId: 'check-a',
      workerId: 'worker-1',
      runtimeMode: 'docker'
    }));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('OPENSHRIKE_EVENT '));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"kind":"runtime"'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"sessionID":"ses_fix_123"'));
    expect(logger.write).toHaveBeenCalledWith('fix.started', expect.objectContaining({
      checkId: 'check-a',
      runtimeMode: 'docker'
    }));
    expect(logger.write).toHaveBeenCalledWith('fix.completed', expect.objectContaining({
      checkId: 'check-a',
      runtimeMode: 'docker'
    }));
    expect(runtime.close).toHaveBeenCalledOnce();
    expect(logger.close).toHaveBeenCalledOnce();
  });
});
