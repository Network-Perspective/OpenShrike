import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadRuntimeConfig, serializeConfig, type LoadedRuntimeConfig} from '../src/lib/config.js';
import {runProcess} from '../src/lib/process.js';
import {
  resolveDockerArtifactsDirectory,
  resolveDockerOpenCodeHostAccess,
  resolveDockerRepoVisibleIgnoredPaths,
  resolveDockerRuntimeMountPlan
} from '../src/lib/scan.js';
import type {ScanCommandOptions} from '../src/lib/types.js';

const tempDirectories: string[] = [];
const modifiedEnvVars = new Map<string, string | undefined>();

afterEach(async () => {
  for (const [name, previousValue] of modifiedEnvVars) {
    if (previousValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previousValue;
    }
  }
  modifiedEnvVars.clear();

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

  it('mounts host OpenCode state into a writable runtime home and forwards provider env vars', async () => {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-docker-host-access-'));
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-opencode-home-'));
    tempDirectories.push(artifactsDir, homeDir);

    const configDir = path.join(homeDir, '.config', 'opencode');
    const dataDir = path.join(homeDir, '.local', 'share', 'opencode');
    await fs.mkdir(configDir, {recursive: true});
    await fs.mkdir(dataDir, {recursive: true});

    setEnvVar('AZURE_OPENAI_API_KEY', 'test-api-key');
    setEnvVar('CUSTOM_MODEL_TOKEN', 'custom-token');
    setEnvVar('TEST_RUNTIME_SECRET', 'runtime-secret');
    setEnvVar('HTTP_PROXY', 'http://proxy.example.test:8080');
    setEnvVar('UNRELATED_ENV', 'should-not-be-forwarded');

    const hostAccess = await resolveDockerOpenCodeHostAccess({
      artifactsDir,
      homePath: homeDir,
      runtimeConfig: {
        configPath: '/tmp/opencode.json',
        config: {},
        requiredEnvVars: ['AZURE_OPENAI_API_KEY', 'CUSTOM_MODEL_TOKEN', 'TEST_RUNTIME_SECRET'],
        missingEnvVars: []
      } satisfies LoadedRuntimeConfig
    });

    expect(hostAccess.env).toEqual({
      HOME: '/io/opencode-home',
      XDG_CONFIG_HOME: '/io/opencode-home/.config',
      XDG_DATA_HOME: '/io/opencode-home/.local/share',
      XDG_STATE_HOME: '/io/opencode-home/.local/state',
      XDG_CACHE_HOME: '/io/opencode-home/.cache'
    });
    expect(hostAccess.mounts).toEqual(expect.arrayContaining([
      {
        source: configDir,
        target: '/io/opencode-home/.config/opencode',
        readonly: true
      },
      {
        source: dataDir,
        target: '/io/opencode-home/.local/share/opencode',
        readonly: false
      }
    ]));
    expect(hostAccess.passThroughEnvVarNames).toEqual(expect.arrayContaining([
      'AZURE_OPENAI_API_KEY',
      'CUSTOM_MODEL_TOKEN',
      'TEST_RUNTIME_SECRET'
    ]));
    expect(hostAccess.passThroughEnvVarNames).not.toContain('HTTP_PROXY');
    expect(hostAccess.passThroughEnvVarNames).not.toContain('AZURE_RESOURCE_NAME');
    expect(hostAccess.passThroughEnvVarNames).not.toContain('UNRELATED_ENV');

    const stateDir = path.join(artifactsDir, 'opencode-home', '.local', 'state');
    const cacheDir = path.join(artifactsDir, 'opencode-home', '.cache');
    expect((await fs.stat(stateDir)).isDirectory()).toBe(true);
    expect((await fs.stat(cacheDir)).isDirectory()).toBe(true);
  });

  it('passes through env vars referenced by OpenCode env placeholders in opencode.json', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-docker-config-'));
    const artifactsDir = path.join(tempRoot, 'artifacts');
    tempDirectories.push(tempRoot);

    const configPath = path.join(tempRoot, 'opencode.json');
    await fs.writeFile(
      configPath,
      `${serializeConfig({
        model: 'azure/gpt-5.4-mini',
        provider: {
          azure: {
            options: {
              apiKey: '{env:AZURE_OPENAI_API_KEY}',
              resourceName: '{env:AZURE_RESOURCE_PREFIX}'
            }
          }
        }
      })}\n`,
      'utf8'
    );

    setEnvVar('AZURE_OPENAI_API_KEY', 'placeholder-key');
    setEnvVar('AZURE_RESOURCE_PREFIX', 'placeholder-resource');
    setEnvVar('UNRELATED_ENV', 'should-not-be-forwarded');

    const runtimeConfig = await loadRuntimeConfig(configPath, {
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini'
    });
    const hostAccess = await resolveDockerOpenCodeHostAccess({
      artifactsDir,
      runtimeConfig
    });

    expect(runtimeConfig.requiredEnvVars).toEqual(['AZURE_OPENAI_API_KEY', 'AZURE_RESOURCE_PREFIX']);
    expect(hostAccess.passThroughEnvVarNames).toEqual(['AZURE_OPENAI_API_KEY', 'AZURE_RESOURCE_PREFIX']);
    expect(hostAccess.passThroughEnvVarNames).not.toContain('UNRELATED_ENV');
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

function setEnvVar(name: string, value: string): void {
  if (!modifiedEnvVars.has(name)) {
    modifiedEnvVars.set(name, process.env[name]);
  }

  process.env[name] = value;
}
