import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {resolveScanOptions, validateScanOptions} from '../src/lib/scan-options.js';
import {writeShrikeInitFiles} from '../src/lib/init/write.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('validateScanOptions', () => {
  it('requires exactly one of check or policy', () => {
    expect(() =>
      validateScanOptions({
        repoPath: '.',
        outputFormat: 'json',
        scanScope: 'uncommitted',
        mockOpencode: false,
        runtimeMode: 'native',
        parallelism: 1,
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
        runtimeMode: 'native',
        parallelism: 1,
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
        runtimeMode: 'native',
        parallelism: 1,
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
      runtimeMode: 'docker',
      parallelism: 'auto',
      ui: false
    });

    expect(result.policyId).toBe('csharp-baseline');
    expect(result.outputFormat).toBe('markdown');
    expect(result.logPath).toBe('logs/opencode.jsonl');
    expect(result.runtimeMode).toBe('docker');
    expect(result.parallelism).toBe('auto');
  });

  it('merges repo-local project defaults before validation', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const nestedRepoPath = path.join(repoRoot, 'packages', 'app');
    await fs.mkdir(nestedRepoPath, {recursive: true});

    const result = await resolveScanOptions({
      repoPath: nestedRepoPath,
      mockOpencode: true
    });

    expect(result.policyId).toBe('typescript-baseline');
    expect(result.repoPath).toBe(nestedRepoPath);
    expect(result.configPath).toBe(path.join(repoRoot, '.openshrike', 'opencode.json'));
    expect(result.runtimeMode).toBe('native');
    expect(result.parallelism).toBe('auto');
    expect(result.outputFormat).toBe('markdown');
  });

  it('discovers repo-local defaults from the current nested working directory', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-cwd-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const nestedRepoPath = path.join(repoRoot, 'packages', 'app');
    await fs.mkdir(nestedRepoPath, {recursive: true});

    const previousCwd = process.cwd();
    try {
      process.chdir(nestedRepoPath);
      const result = await resolveScanOptions({
        mockOpencode: true
      });

      expect(result.policyId).toBe('typescript-baseline');
      expect(result.repoPath).toBe(repoRoot);
      expect(result.configPath).toBe(path.join(repoRoot, '.openshrike', 'opencode.json'));
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('lets explicit CLI values override repo-local defaults', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-override-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const result = await resolveScanOptions({
      repoPath: repoRoot,
      policyId: 'shared-foundation',
      runtimeMode: 'docker',
      ui: false,
      mockOpencode: true
    });

    expect(result.policyId).toBe('shared-foundation');
    expect(result.runtimeMode).toBe('docker');
    expect(result.ui).toBe(false);
  });
});
