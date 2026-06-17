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

vi.mock('../src/lib/checks.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/checks.js')>('../src/lib/checks.js');
  return {
    ...actual,
    readCheckDefinition: mockReadCheckDefinition
  };
});

import {
  buildBatchPrompt,
  buildPrompt,
  CheckEvaluationError,
  evaluateCheck,
  evaluateCheckBatch,
  getCheckEvaluationOriginalOutput
} from '../src/lib/evaluator.js';

describe('evaluator', () => {
  const scopeContext: ScanScopeContext = {
    kind: 'uncommitted',
    label: 'uncommitted changes',
    files: ['src/example.ts'],
    isFullRepository: false,
    scopeEvidence: {
      mode: 'complete',
      commands: [
        {
          description: 'Tracked changes relative to HEAD',
          command: 'git -C /workspace/repo --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative HEAD',
          output: 'diff --git a/src/example.ts b/src/example.ts\n+const value = 1;'
        }
      ]
    }
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
    expect(prompt).toContain(
      'If scope is not full repository, evidence paths MUST come from the scoped file allowlist above.'
    );
    expect(prompt).toContain(
      'Treat the captured scope evidence at the end of this prompt as authoritative for scope discovery.'
    );
  });

  it('renders the full scoped file allowlist without truncating after 200 entries', () => {
    const prompt = buildPrompt(
      'check-a',
      '# check definition',
      '/workspace/repo',
      {
        ...scopeContext,
        files: Array.from({length: 205}, (_, index) => `src/file-${index + 1}.ts`)
      }
    );

    expect(prompt).toContain('Scoped file allowlist (205):');
    expect(prompt).toContain('- src/file-205.ts');
    expect(prompt).not.toContain('more files');
  });

  it('appends captured scope evidence as the final prompt section', () => {
    const prompt = buildPrompt(
      'check-a',
      '# check definition',
      '/workspace/repo',
      scopeContext
    );

    expect(prompt.indexOf('Authoritative scope evidence:')).toBeGreaterThan(prompt.indexOf('Rules:'));
    expect(prompt.trimEnd().endsWith('+const value = 1;')).toBe(true);
  });

  it('omits oversized scope evidence from the prompt and points the agent at scoped files', () => {
    const prompt = buildPrompt(
      'check-a',
      '# check definition',
      '/workspace/repo',
      {
        ...scopeContext,
        scopeEvidence: {
          mode: 'omitted',
          commands: [
            {
              description: 'Tracked changes relative to HEAD',
              command: 'git -C /workspace/repo --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative HEAD',
              output: ''
            }
          ]
        }
      }
    );

    expect(prompt).toContain('Inspect scoped files directly to gather evidence instead of relying on a partial diff.');
    expect(prompt).not.toContain('diff --git a/src/example.ts b/src/example.ts');
    expect(prompt).not.toContain('Authoritative scope evidence:');
    expect(prompt).not.toContain('Scope capture 1:');
    expect(prompt).not.toContain('git -C /workspace/repo --no-pager diff');
  });

  it('builds a batch prompt with a shared contract and repeated check definitions', () => {
    const prompt = buildBatchPrompt({
      batchLabel: 'rel batch (2 checks)',
      repoPath: '/workspace/repo',
      scopeContext,
      checks: [
        {
          id: 'check-a',
          title: 'Check A',
          definition: '# Check A'
        },
        {
          id: 'check-b',
          title: 'Check B',
          definition: '# Check B'
        }
      ]
    });

    expect(prompt).toContain('Batch label: rel batch (2 checks)');
    expect(prompt).toContain('Requested checks (2):');
    expect(prompt).toContain('Check id: check-a');
    expect(prompt).toContain('Check id: check-b');
    expect(prompt).toContain('"results": [');
    expect(prompt).toContain('Do not merge, omit, or duplicate checks');
  });

  it('salvages valid siblings and marks broken batch entries as inconclusive', async () => {
    mockReadCheckDefinition.mockImplementation(async (checkId: string) => `# ${checkId}`);
    const runtime = createRuntime({
      results: [
        {
          id: 'check-a',
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: ['src/example.ts:1'],
          rationale: 'Scoped evidence is valid.',
          remediation: []
        },
        {
          id: 'check-b',
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: ['src/out-of-scope.ts:9'],
          rationale: 'This evidence is out of scope.',
          remediation: []
        }
      ]
    });

    const result = await evaluateCheckBatch({
      batchId: 'scan-batch-1',
      batchLabel: 'rel batch (2 checks)',
      checkIds: ['check-a', 'check-b'],
      repoPath: '/workspace/repo',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini',
      scopeContext,
      emulateOpencode: false,
      runtime
    });

    expect(result.warnings).toEqual([]);
    expect(result.resultsByCheckId.get('check-a')).toMatchObject({
      id: 'check-a',
      status: 'pass',
      confidence: 'HIGH'
    });
    expect(result.resultsByCheckId.get('check-b')).toMatchObject({
      id: 'check-b',
      status: 'unknown',
      confidence: 'LOW'
    });
    expect(result.resultsByCheckId.get('check-b')?.rationale).toContain('outside scan scope');
  });

  it('marks duplicate or missing batch ids as inconclusive without discarding valid entries', async () => {
    const runtime = createRuntime({
      results: [
        {
          id: 'check-a',
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: ['src/example.ts:1'],
          rationale: 'Valid.',
          remediation: []
        },
        {
          id: 'check-a',
          version: '0.1.0',
          status: 'fail',
          confidence: 'HIGH',
          evidence: ['src/example.ts:2'],
          rationale: 'Duplicate.',
          remediation: []
        },
        {
          id: 'extra-check',
          version: '0.1.0',
          status: 'pass',
          confidence: 'LOW',
          evidence: [],
          rationale: 'Ignore me.',
          remediation: []
        }
      ]
    });

    const result = await evaluateCheckBatch({
      batchId: 'scan-batch-2',
      batchLabel: 'rel batch (2 checks)',
      checkIds: ['check-a', 'check-b'],
      repoPath: '/workspace/repo',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini',
      scopeContext,
      emulateOpencode: false,
      runtime
    });

    expect(result.warnings).toEqual([
      "Ignored unexpected batch result id 'extra-check'.",
      "Batch response returned duplicate entries for 'check-a'."
    ]);
    expect(result.resultsByCheckId.get('check-a')?.status).toBe('unknown');
    expect(result.resultsByCheckId.get('check-b')?.status).toBe('unknown');
    expect(result.resultsByCheckId.get('check-b')?.rationale).toContain("did not include a result for 'check-b'");
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
