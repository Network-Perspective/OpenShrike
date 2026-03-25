import {describe, expect, it} from 'vitest';
import {validateScanOptions} from '../src/lib/scan-options.js';

describe('validateScanOptions', () => {
  it('requires exactly one of check or policy', () => {
    expect(() =>
      validateScanOptions({
        repoPath: '.',
        outputFormat: 'json',
        scanScope: 'uncommitted',
        mockOpencode: false,
        ui: false
      })
    ).toThrow(/exactly one/i);

    expect(() =>
      validateScanOptions({
        checkId: 'a',
        policyId: 'b',
        repoPath: '.',
        outputFormat: 'json',
        scanScope: 'uncommitted',
        mockOpencode: false,
        ui: false
      })
    ).toThrow(/exactly one/i);
  });

  it('validates scan target requirements', () => {
    expect(() =>
      validateScanOptions({
        checkId: 'csharp-rel-001-cancellation-tokens',
        repoPath: '.',
        outputFormat: 'json',
        scanScope: 'commit',
        mockOpencode: false,
        ui: false
      })
    ).toThrow(/scan-target/i);
  });

  it('accepts valid policy input', () => {
    const result = validateScanOptions({
      policyId: 'csharp-baseline',
      repoPath: '.',
      outputFormat: 'markdown',
      scanScope: 'full',
      mockOpencode: true,
      logPath: 'logs/opencode.jsonl',
      ui: false
    });

    expect(result.policyId).toBe('csharp-baseline');
    expect(result.outputFormat).toBe('markdown');
    expect(result.logPath).toBe('logs/opencode.jsonl');
  });
});
