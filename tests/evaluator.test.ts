import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  MAX_CHECK_EVIDENCE_ITEMS,
  MAX_CHECK_REMEDIATION_ITEMS
} from '../src/lib/constants.js';
import type {OpenCodeRuntime} from '../src/lib/runtime.js';
import type {ScanScopeContext} from '../src/lib/types.js';

const {mockReadCheckDefinition} = vi.hoisted(() => ({
  mockReadCheckDefinition: vi.fn()
}));

vi.mock('../src/lib/checks.js', () => ({
  readCheckDefinition: mockReadCheckDefinition
}));

import {
  buildPrompt,
  CheckEvaluationError,
  evaluateCheck,
  getCheckEvaluationOriginalOutput
} from '../src/lib/evaluator.js';

describe('evaluator', () => {
  const scopeContext: ScanScopeContext = {
    kind: 'uncommitted',
    label: 'uncommitted changes',
    files: ['src/example.ts'],
    isFullRepository: false
  };

  beforeEach(() => {
    mockReadCheckDefinition.mockReset();
    mockReadCheckDefinition.mockResolvedValue('# check definition');
  });

  it('includes explicit evidence and remediation limits in the prompt', () => {
    const prompt = buildPrompt(
      'check-a',
      '# check definition',
      '/workspace/repo',
      scopeContext
    );

    expect(prompt).toContain(`Keep evidence to at most ${MAX_CHECK_EVIDENCE_ITEMS} items.`);
    expect(prompt).toContain(`Keep remediation to at most ${MAX_CHECK_REMEDIATION_ITEMS} items.`);
    expect(prompt).toContain('If scope is not full repository, evidence paths MUST come from listed scoped files.');
  });

  it('rejects oversized evidence arrays from agent output', async () => {
    const evidence = Array.from({length: MAX_CHECK_EVIDENCE_ITEMS + 1}, (_, index) => `src/example.ts:${index + 1}`);

    const runtime = createRuntime({
      id: 'check-a',
      version: '0.1.0',
      status: 'pass',
      confidence: 'HIGH',
      evidence,
      rationale: 'Too much evidence.',
      remediation: []
    });

    await expect(evaluateCheck({
      checkId: 'check-a',
      repoPath: '/workspace/repo',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini',
      scopeContext,
      emulateOpencode: false,
      runtime
    })).rejects.toBeInstanceOf(CheckEvaluationError);

    await assertOriginalOutputIncludes(runtime, '"evidence": [');
  });

  it('rejects oversized remediation arrays from agent output', async () => {
    const remediation = Array.from({length: MAX_CHECK_REMEDIATION_ITEMS + 1}, (_, index) => `step ${index + 1}`);

    const runtime = createRuntime({
      id: 'check-a',
      version: '0.1.0',
      status: 'fail',
      confidence: 'HIGH',
      evidence: ['src/example.ts:1'],
      rationale: 'Too much remediation.',
      remediation
    });

    await expect(evaluateCheck({
      checkId: 'check-a',
      repoPath: '/workspace/repo',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini',
      scopeContext,
      emulateOpencode: false,
      runtime
    })).rejects.toBeInstanceOf(CheckEvaluationError);

    await assertOriginalOutputIncludes(runtime, '"remediation": [');
  });
});

function createRuntime(payload: Record<string, unknown>): OpenCodeRuntime {
  return {
    runPrompt: vi.fn().mockResolvedValue({
      text: JSON.stringify(payload, null, 2)
    })
  } as unknown as OpenCodeRuntime;
}

async function assertOriginalOutputIncludes(
  runtime: OpenCodeRuntime,
  expectedFragment: string
): Promise<void> {
  try {
    await evaluateCheck({
      checkId: 'check-a',
      repoPath: '/workspace/repo',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini',
      scopeContext: {
        kind: 'uncommitted',
        label: 'uncommitted changes',
        files: ['src/example.ts'],
        isFullRepository: false
      },
      emulateOpencode: false,
      runtime
    });
  } catch (error) {
    expect(getCheckEvaluationOriginalOutput(error)).toContain(expectedFragment);
    return;
  }

  throw new Error('Expected evaluator to reject oversized payload.');
}
