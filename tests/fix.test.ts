import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  CheckResult,
  SavedScanRequest,
  ScanCommandOptions,
  ScanReport,
  ScanRuntimeEvent
} from '../src/lib/types.js';

const {
  mockSpawn,
  mockLoadRuntimeConfig,
  mockEnsureDockerRuntimeImage,
  mockResolveDockerArtifactsDirectory,
  mockResolveDockerOpenCodeHostAccess,
  mockResolveDockerRuntimeMountPlan,
  mockRunScan,
  mockFindToolRoot
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockLoadRuntimeConfig: vi.fn(),
  mockEnsureDockerRuntimeImage: vi.fn(),
  mockResolveDockerArtifactsDirectory: vi.fn(),
  mockResolveDockerOpenCodeHostAccess: vi.fn(),
  mockResolveDockerRuntimeMountPlan: vi.fn(),
  mockRunScan: vi.fn(),
  mockFindToolRoot: vi.fn()
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

vi.mock('../src/lib/config.js', () => ({
  loadRuntimeConfig: mockLoadRuntimeConfig
}));

vi.mock('../src/lib/scan.js', () => ({
  ensureDockerRuntimeImage: mockEnsureDockerRuntimeImage,
  resolveDockerArtifactsDirectory: mockResolveDockerArtifactsDirectory,
  resolveDockerOpenCodeHostAccess: mockResolveDockerOpenCodeHostAccess,
  resolveDockerRuntimeMountPlan: mockResolveDockerRuntimeMountPlan,
  runScan: mockRunScan
}));

vi.mock('../src/lib/project-root.js', () => ({
  findToolRoot: mockFindToolRoot
}));

const {encodeDockerWireMessage} = await import('../src/lib/docker-protocol.js');
const {fixAndRecheckCheck, recheckSingleCheck} = await import('../src/lib/fix.js');

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).reverse().map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

beforeEach(() => {
  mockSpawn.mockReset();
  mockLoadRuntimeConfig.mockReset();
  mockEnsureDockerRuntimeImage.mockReset();
  mockResolveDockerArtifactsDirectory.mockReset();
  mockResolveDockerOpenCodeHostAccess.mockReset();
  mockResolveDockerRuntimeMountPlan.mockReset();
  mockRunScan.mockReset();
  mockFindToolRoot.mockReset();

  mockLoadRuntimeConfig.mockResolvedValue({
    configPath: '/tmp/opencode.json',
    config: {},
    requiredEnvVars: [],
    missingEnvVars: []
  });
  mockEnsureDockerRuntimeImage.mockResolvedValue(undefined);
  mockResolveDockerOpenCodeHostAccess.mockResolvedValue({
    mounts: [],
    env: {},
    passThroughEnvVarNames: []
  });
  mockResolveDockerRuntimeMountPlan.mockResolvedValue({
    workspaceHostPath: '/host/repo',
    repoContainerPath: '/workspace/repo',
    projectChecksContainerPath: null,
    extraMounts: [],
    safeDirectories: ['/workspace/repo']
  });
  mockFindToolRoot.mockReturnValue('/workspace/tool');
});

describe('recheckSingleCheck', () => {
  it('forwards runtime events from runScan to the caller', async () => {
    const runtimeEvent = makeRuntimeEvent({
      messageID: 'msg-recheck-1',
      input: 101,
      output: 7
    });
    mockRunScan.mockImplementation(async (_options, hooks?: {onRuntimeEvent?: (event: ScanRuntimeEvent) => void}) => {
      hooks?.onRuntimeEvent?.(runtimeEvent);
      return makeReport('check-a', 'pass');
    });

    const seenEvents: ScanRuntimeEvent[] = [];
    const result = await recheckSingleCheck({
      base: makeOptions({runtimeMode: 'docker'}),
      request: makeRequest({runtimeMode: 'docker'}),
      repoPath: '/repo',
      checkId: 'check-a',
      onRuntimeEvent: event => {
        seenEvents.push(event);
      }
    });

    expect(result.status).toBe('pass');
    expect(seenEvents).toEqual([runtimeEvent]);
  });
});

describe('fixAndRecheckCheck', () => {
  it('forwards docker fix worker runtime events and recheck runtime events to the caller', async () => {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-fix-artifacts-'));
    tempDirectories.push(artifactsDir);
    mockResolveDockerArtifactsDirectory.mockResolvedValue(artifactsDir);

    const fixRuntimeEvent = makeRuntimeEvent({
      messageID: 'msg-fix-1',
      input: 321,
      output: 34
    });
    const recheckRuntimeEvent = makeRuntimeEvent({
      messageID: 'msg-recheck-1',
      input: 654,
      output: 89
    });

    mockSpawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from(`${encodeDockerWireMessage({
          kind: 'runtime',
          event: fixRuntimeEvent
        })}\n`, 'utf8'));
        child.emit('close', 0);
      });

      return child;
    });

    mockRunScan.mockImplementation(async (_options, hooks?: {onRuntimeEvent?: (event: ScanRuntimeEvent) => void}) => {
      hooks?.onRuntimeEvent?.(recheckRuntimeEvent);
      return makeReport('check-a', 'pass');
    });

    const seenEvents: ScanRuntimeEvent[] = [];
    const result = await fixAndRecheckCheck({
      base: makeOptions({runtimeMode: 'docker'}),
      request: makeRequest({runtimeMode: 'docker'}),
      report: makeReport('check-a', 'fail'),
      check: makeCheck('check-a', 'fail'),
      onRuntimeEvent: event => {
        seenEvents.push(event);
      }
    });

    expect(result.status).toBe('pass');
    expect(seenEvents).toEqual([fixRuntimeEvent, recheckRuntimeEvent]);
    expect(mockSpawn).toHaveBeenCalledOnce();
  });
});

function makeOptions(overrides: Partial<ScanCommandOptions> = {}): ScanCommandOptions {
  return {
    checkId: undefined,
    policyId: undefined,
    projectChecksDir: undefined,
    repoPath: '/repo',
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

function makeRequest(overrides: Partial<SavedScanRequest> = {}): SavedScanRequest {
  return {
    checkId: null,
    policyId: 'policy-a',
    projectChecksDir: null,
    scanScope: 'full',
    scanTarget: null,
    runtimeMode: 'native',
    ...overrides
  };
}

function makeCheck(id: string, status: CheckResult['status']): CheckResult {
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

function makeReport(id: string, status: CheckResult['status']): ScanReport {
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
      unknown: status === 'unknown' ? 1 : 0
    },
    checks: [makeCheck(id, status)]
  };
}

function makeRuntimeEvent(options: {
  messageID: string;
  input: number;
  output: number;
}): ScanRuntimeEvent {
  return {
    checkId: 'check-a',
    workerId: 'worker-1',
    runtimeMode: 'docker',
    event: {
      type: 'message.updated',
      properties: {
        info: {
          id: options.messageID,
          role: 'assistant',
          tokens: {
            input: options.input,
            output: options.output
          }
        }
      }
    }
  };
}
