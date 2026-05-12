import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {runProcess} from '../src/lib/process.js';
import {
  resolveDockerArtifactsDirectory,
  resolveDockerRepoVisibleIgnoredPaths,
  resolveDockerRuntimeMountPlan
} from '../src/lib/scan.js';
import type {ScanCommandOptions} from '../src/lib/types.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).reverse().map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('docker runtime helpers', () => {
  it('stores default docker artifacts under .openshrike/artifacts', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-docker-artifacts-'));
    tempDirectories.push(repoRoot);

    const artifactsDir = await resolveDockerArtifactsDirectory(makeOptions(repoRoot, {}));

    expect(path.dirname(artifactsDir)).toBe(path.join(repoRoot, '.openshrike', 'artifacts'));
    expect(path.basename(artifactsDir)).toMatch(/^docker-/);
  });

  it('mounts linked git metadata for worktrees', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-worktree-repo-'));
    const worktreeRoot = `${repoRoot}-wt`;
    tempDirectories.push(repoRoot, worktreeRoot);

    await initializeGitRepository(repoRoot);
    await runProcess('git', ['worktree', 'add', '-b', 'docker-worktree', worktreeRoot], {
      cwd: repoRoot
    });

    const mountPlan = await resolveDockerRuntimeMountPlan(worktreeRoot, null);
    const gitDirHostPath = await gitRevParse(worktreeRoot, ['--absolute-git-dir']);
    const gitCommonDirHostPath = await gitRevParse(worktreeRoot, ['--path-format=absolute', '--git-common-dir']);

    expect(mountPlan.workspaceHostPath).toBe(worktreeRoot);
    expect(mountPlan.repoContainerPath).toBe('/workspace/repo');
    expect(mountPlan.safeDirectories).toEqual(['/workspace/repo']);
    expect(mountPlan.extraMounts).toEqual(expect.arrayContaining([
      {
        source: gitDirHostPath,
        target: gitDirHostPath,
        readonly: true
      },
      {
        source: gitCommonDirHostPath,
        target: gitCommonDirHostPath,
        readonly: true
      }
    ]));
    expect(mountPlan.extraMounts.some(mount => mount.source === worktreeRoot)).toBe(false);
  });

  it('derives repo-visible ignore paths for docker artifacts mounted through /io', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-docker-ignore-'));
    tempDirectories.push(repoRoot);
    const artifactsDir = path.join(repoRoot, '.openshrike', 'artifacts', 'docker-123');

    const ignoredPaths = resolveDockerRepoVisibleIgnoredPaths({
      repoContainerPath: '/workspace/repo',
      workspaceHostPath: repoRoot,
      hostPaths: [artifactsDir]
    });

    expect(ignoredPaths).toEqual(['.openshrike/artifacts/docker-123']);
  });
});

async function initializeGitRepository(repoRoot: string): Promise<void> {
  await runProcess('git', ['init'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.email', 'openshrike@example.test'], {cwd: repoRoot});
  await runProcess('git', ['config', 'user.name', 'OpenShrike Test'], {cwd: repoRoot});
  await fs.writeFile(path.join(repoRoot, 'README.md'), 'hello\n', 'utf8');
  await runProcess('git', ['add', 'README.md'], {cwd: repoRoot});
  await runProcess('git', ['commit', '-m', 'init'], {cwd: repoRoot});
}

async function gitRevParse(repoRoot: string, args: string[]): Promise<string> {
  const {stdout} = await runProcess('git', ['rev-parse', ...args], {cwd: repoRoot});
  return stdout.trim();
}

function makeOptions(repoPath: string, overrides: Partial<ScanCommandOptions>): ScanCommandOptions {
  return {
    checkId: 'check-a',
    policyId: undefined,
    repoPath,
    outputFormat: 'json',
    agent: undefined,
    model: undefined,
    emitBundlePath: undefined,
    scanScope: 'full',
    scanTarget: undefined,
    mockOpencode: false,
    configPath: undefined,
    logPath: undefined,
    runtimeMode: 'docker',
    image: undefined,
    artifactsDir: undefined,
    parallelism: 1,
    ui: false,
    ...overrides
  };
}
