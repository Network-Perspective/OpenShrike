import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockExecuteFixCommand = vi.fn();
const mockExecuteInitCommand = vi.fn();
const mockExecuteInternalFixWorkerCommand = vi.fn();
const mockExecuteInternalScanWorkerCommand = vi.fn();
const mockExecuteScanCommand = vi.fn();

vi.mock('../src/commands/fix.js', () => ({
  executeFixCommand: mockExecuteFixCommand
}));

vi.mock('../src/commands/fix-worker.js', () => ({
  executeInternalFixWorkerCommand: mockExecuteInternalFixWorkerCommand
}));

vi.mock('../src/commands/init.js', () => ({
  executeInitCommand: mockExecuteInitCommand
}));

vi.mock('../src/commands/scan-worker.js', () => ({
  executeInternalScanWorkerCommand: mockExecuteInternalScanWorkerCommand
}));

vi.mock('../src/commands/scan.js', () => ({
  executeScanCommand: mockExecuteScanCommand
}));

const {runCli} = await import('../src/cli.js');

const tempDirectories: string[] = [];
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockExecuteFixCommand.mockReset();
  mockExecuteInitCommand.mockReset();
  mockExecuteInternalFixWorkerCommand.mockReset();
  mockExecuteInternalScanWorkerCommand.mockReset();
  mockExecuteScanCommand.mockReset();
  process.exitCode = undefined;
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  stdoutWriteSpy.mockRestore();
  process.exitCode = undefined;
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('runCli', () => {
  it('shows help when invoked without arguments', async () => {
    const exitCode = await runCli(['node', 'shrike']);

    expect(exitCode).toBe(0);
    expect(mockExecuteScanCommand).not.toHaveBeenCalled();
    expect(renderedOutput(stdoutWriteSpy)).toContain('Usage: shrike');
    expect(renderedOutput(stdoutWriteSpy)).toContain('Commands:');
  });

  it('renders grouped scan help with the renamed flags and a discovered default target', async () => {
    const repoRoot = await makeRepoWithDevelopBranch();

    const exitCode = await runCli(['node', 'shrike', 'scan', '--path', repoRoot, '--help']);
    const output = renderedOutput(stdoutWriteSpy);

    expect(exitCode).toBe(0);
    expect(mockExecuteScanCommand).not.toHaveBeenCalled();
    expect(output).toContain('Usage: shrike scan [options]');
    expect(output).toContain('--scope <SCOPE>');
    expect(output).toContain('--target <TARGET>');
    expect(output).toContain('(default: develop...HEAD)');
    expect(output).toContain('--path <PATH>');
    expect(output).toContain('-p, --parallelism <N_OR_AUTO_OR_FULL>');
    expect(output).toContain('-l, --last-scan');
    expect(output).toContain('--mock-run');
    expect(output).not.toContain('--repo <PATH>');
    expect(output).not.toContain('--scan-scope <SCOPE>');
    expect(output).not.toContain('--scan-target <TARGET>');
    expect(output).not.toContain('--mock-opencode');
  });

  it('renders grouped fix help with the renamed flags', async () => {
    const repoRoot = await makeRepoWithDevelopBranch();

    const exitCode = await runCli(['node', 'shrike', 'fix', '--path', repoRoot, '--help']);
    const output = renderedOutput(stdoutWriteSpy);

    expect(exitCode).toBe(0);
    expect(mockExecuteFixCommand).not.toHaveBeenCalled();
    expect(output).toContain('Usage: shrike fix [options]');
    expect(output).toContain('--scope <SCOPE>');
    expect(output).toContain('--target <TARGET>');
    expect(output).toContain('--path <PATH>');
    expect(output).toContain('--agent <NAME>');
    expect(output).toContain('--model <MODEL>');
    expect(output).toContain('--mock-run');
    expect(output).not.toContain('--fix-agent');
    expect(output).not.toContain('--fix-model');
  });

  it('passes the renamed scan flags through to executeScanCommand', async () => {
    mockExecuteScanCommand.mockResolvedValue(0);

    const exitCode = await runCli([
      'node',
      'shrike',
      'scan',
      '--check',
      'check-a',
      '--path',
      '/repo',
      '--scope',
      'pr',
      '--target',
      'develop...HEAD',
      '--runtime',
      'docker',
      '-p',
      'full',
      '--mock-run',
      '--no-ui'
    ]);

    expect(exitCode).toBe(0);
    expect(mockExecuteScanCommand).toHaveBeenCalledWith(
      {
        checkId: 'check-a',
        repoPath: '/repo',
        scanScope: 'pr',
        scanTarget: 'develop...HEAD',
        mockOpencode: true,
        runtimeMode: 'docker',
        parallelism: 'full',
        lastScan: false,
        ui: false
      },
      {
        promptForFullScanWhenScopeEmpty: false
      }
    );
  });

  it('passes the renamed fix flags through to executeFixCommand', async () => {
    mockExecuteFixCommand.mockResolvedValue(0);

    const exitCode = await runCli([
      'node',
      'shrike',
      'fix',
      '--policy',
      'policy-a',
      '--path',
      '/repo',
      '--scope',
      'branch',
      '--target',
      'develop',
      '--runtime',
      'docker',
      '--agent',
      'shrike-fixer-custom',
      '--model',
      'azure/gpt-5.4',
      '-p',
      'full',
      '--mock-run',
      '-l'
    ]);

    expect(exitCode).toBe(0);
    expect(mockExecuteFixCommand).toHaveBeenCalledWith({
      policyId: 'policy-a',
      repoPath: '/repo',
      fixAgent: 'shrike-fixer-custom',
      fixModel: 'azure/gpt-5.4',
      scanScope: 'branch',
      scanTarget: 'develop',
      mockOpencode: true,
      runtimeMode: 'docker',
      parallelism: 'full',
      lastScan: true,
      ui: false
    });
  });

  it('marks a bare scan invocation as eligible for the full-scan fallback prompt', async () => {
    mockExecuteScanCommand.mockResolvedValue(0);

    const exitCode = await runCli(['node', 'shrike', 'scan']);

    expect(exitCode).toBe(0);
    expect(mockExecuteScanCommand).toHaveBeenCalledOnce();
    expect(mockExecuteScanCommand).toHaveBeenCalledWith(
      {
        mockOpencode: false,
        lastScan: false
      },
      {
        promptForFullScanWhenScopeEmpty: true
      }
    );
  });
});

async function makeRepoWithDevelopBranch(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-cli-help-'));
  tempDirectories.push(repoRoot);
  git(repoRoot, ['-c', 'init.defaultBranch=main', 'init']);
  git(repoRoot, ['config', 'user.name', 'OpenShrike']);
  git(repoRoot, ['config', 'user.email', 'openshrike@example.com']);
  await fs.writeFile(path.join(repoRoot, 'README.md'), 'hello\n', 'utf8');
  git(repoRoot, ['add', 'README.md']);
  git(repoRoot, ['commit', '-m', 'initial']);
  git(repoRoot, ['checkout', '-b', 'develop']);
  git(repoRoot, ['checkout', '-b', 'feature/test']);
  return repoRoot;
}

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function renderedOutput(writeSpy: ReturnType<typeof vi.spyOn>): string {
  return writeSpy.mock.calls.map((call: [unknown]) => String(call[0])).join('');
}
