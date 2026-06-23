import {beforeEach, describe, expect, it, vi} from 'vitest';
import {OPENCODE_FIX_INACTIVITY_TIMEOUT_MS} from '../src/lib/constants.js';
import type {OpenCodeRuntime} from '../src/lib/runtime.js';
import type {CheckResult, SavedScanRequest, ScanScopeContext} from '../src/lib/types.js';

const {mockReadCheckDefinition} = vi.hoisted(() => ({
  mockReadCheckDefinition: vi.fn()
}));

vi.mock('../src/lib/checks.js', () => ({
  readCheckDefinition: mockReadCheckDefinition
}));

import {runFixForCheck} from '../src/lib/fix-runtime.js';

describe('runFixForCheck', () => {
  beforeEach(() => {
    mockReadCheckDefinition.mockReset();
    mockReadCheckDefinition.mockResolvedValue('# check definition');
  });

  it('uses the fix-specific runtime settings when prompting OpenCode', async () => {
    const runtime = {
      runPrompt: vi.fn().mockResolvedValue({
        sessionId: 'ses_fix_123',
        text: ''
      })
    } as unknown as OpenCodeRuntime;
    const check: CheckResult = {
      id: 'check-a',
      version: '0.1.0',
      status: 'fail',
      confidence: 'HIGH',
      evidence: ['src/example.ts:1'],
      rationale: 'broken',
      remediation: ['fix it']
    };
    const request: SavedScanRequest = {
      checkId: null,
      policyId: 'policy-a',
      projectChecksDir: null,
      scanScope: 'full',
      scanTarget: null,
      runtimeMode: 'docker'
    };
    const scopeContext: ScanScopeContext = {
      kind: 'full',
      label: 'full repository',
      files: [],
      isFullRepository: true
    };

    await runFixForCheck({
      check,
      request,
      repoPath: '/workspace/repo',
      projectChecksDir: undefined,
      agent: 'shrike-fixer',
      model: 'azure/gpt-5.4',
      runtime,
      emulateOpencode: false,
      scopeContext
    });

    expect(runtime.runPrompt).toHaveBeenCalledWith(expect.objectContaining({
      agent: 'shrike-fixer',
      model: 'azure/gpt-5.4',
      title: 'check-a fix',
      checkId: 'check-a',
      allowEmptyText: true,
      requestInactivityTimeoutMs: OPENCODE_FIX_INACTIVITY_TIMEOUT_MS,
      completionInactivityTimeoutMs: OPENCODE_FIX_INACTIVITY_TIMEOUT_MS
    }));
  });
});
