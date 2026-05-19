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
    ).toThrow(/--target/i);
  });

  it('allows branch scope without an explicit target so runtime scope discovery can apply the default', () => {
    const result = validateScanOptions({
      checkId: 'csharp-rel-001-cancellation-tokens',
      repoPath: '.',
      outputFormat: 'json',
      scanScope: 'branch',
      mockOpencode: false,
      runtimeMode: 'native',
      parallelism: 1,
      ui: false
    });

    expect(result.scanScope).toBe('branch');
    expect(result.scanTarget).toBeUndefined();
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

  it('accepts full parallelism', () => {
    const result = validateScanOptions({
      policyId: 'csharp-baseline',
      repoPath: '.',
      outputFormat: 'markdown',
      scanScope: 'full',
      mockOpencode: true,
      runtimeMode: 'native',
      parallelism: 'full',
      ui: false
    });

    expect(result.parallelism).toBe('full');
  });

  it('accepts project-local checks input without a policy id', () => {
    const result = validateScanOptions({
      projectChecksDir: '.openshrike/checks',
      repoPath: '.',
      outputFormat: 'markdown',
      scanScope: 'full',
      mockOpencode: true,
      runtimeMode: 'native',
      parallelism: 1,
      ui: false
    });

    expect(result.projectChecksDir).toBe('.openshrike/checks');
    expect(result.policyId).toBeUndefined();
  });

  it('merges repo-local project defaults before validation', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyIds: ['typescript-baseline'],
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

    expect(result.projectChecksDir).toBe(path.join(repoRoot, '.openshrike', 'checks'));
    expect(result.policyId).toBeUndefined();
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
      policyIds: ['typescript-baseline'],
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

      expect(result.projectChecksDir).toBe(path.join(repoRoot, '.openshrike', 'checks'));
      expect(result.policyId).toBeUndefined();
      expect(result.repoPath).toBe(repoRoot);
      expect(result.configPath).toBe(path.join(repoRoot, '.openshrike', 'opencode.json'));
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('lets an explicit check filter override repo-local defaults', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-override-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const result = await resolveScanOptions({
      repoPath: repoRoot,
      checkId: 'typescript-api-001-public-boundary-types-avoid-any',
      runtimeMode: 'docker',
      ui: false,
      mockOpencode: true
    });

    expect(result.projectChecksDir).toBe(path.join(repoRoot, '.openshrike', 'checks'));
    expect(result.checkId).toBe('typescript-api-001-public-boundary-types-avoid-any');
    expect(result.runtimeMode).toBe('docker');
    expect(result.ui).toBe(false);
  });

  it('rejects policy overrides when project-local checks are configured', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scan-options-policy-'));
    tempDirectories.push(repoRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    await expect(resolveScanOptions({
      repoPath: repoRoot,
      policyId: 'shared-foundation',
      mockOpencode: true
    })).rejects.toThrow(/project-local checks/i);
  });
});
