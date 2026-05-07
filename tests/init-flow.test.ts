import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {loadRuntimeConfig, serializeConfig} from '../src/lib/config.js';
import {loadProjectConfig} from '../src/lib/project-config.js';
import {writeShrikeInitFiles} from '../src/lib/init/write.js';
import type {InitHistoryItem, InitScreenResult, InitScreenSpec} from '../src/ui/init-app.js';

const mockCreateInitUiSession = vi.fn();
const mockSpawn = vi.fn();

vi.mock('../src/ui/init-app.js', async () => {
  const actual = await vi.importActual<typeof import('../src/ui/init-app.js')>('../src/ui/init-app.js');
  return {
    ...actual,
    createInitUiSession: mockCreateInitUiSession
  };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

const {runInitCommand} = await import('../src/lib/init.js');

type ScreenHandler = (
  spec: InitScreenSpec<string>,
  history: InitHistoryItem[]
) => InitScreenResult<string> | Promise<InitScreenResult<string>>;

const tempDirectories: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPath = process.env.PATH;
const stdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stderrTtyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

beforeEach(() => {
  setTty(process.stdin, true);
  setTty(process.stderr, true);
  mockCreateInitUiSession.mockReset();
  mockSpawn.mockReset();
  mockSpawn.mockImplementation(() => {
    throw new Error('Unexpected external command.');
  });
});

afterEach(async () => {
  restoreTty(process.stdin, stdinTtyDescriptor);
  restoreTty(process.stderr, stderrTtyDescriptor);
  restoreEnv('HOME', originalHome);
  restoreEnv('USERPROFILE', originalUserProfile);
  restoreEnv('PATH', originalPath);
  vi.restoreAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('runInitCommand', () => {
  it('initializes a fresh repo from discovered OpenCode config and returns run-scan when selected', async () => {
    const repoRoot = await makeTypescriptRepo();
    const {homeRoot} = await makeDiscoveredOpenCodeHome({
      models: ['azure/gpt-5.4-mini', 'azure/gpt-5.4'],
      defaultModel: 'azure/gpt-5.4-mini',
      authPresent: true
    });
    useHome(homeRoot);

    const session = createScriptedSession([
      spec => {
        expect(spec.prompt).toBe('OpenCode discovery');
        expect(spec.options.map(option => option.value)).toEqual([
          'use-discovered',
          'auth-login',
          'exit'
        ]);
        expect(spec.summaryItems).toEqual([
          {label: 'default model', value: 'azure/gpt-5.4-mini'},
          {label: 'providers', value: 'azure'},
          {label: 'config file', value: '~/.config/opencode/opencode.json'},
          {label: 'auth store', value: 'present (~/.local/share/opencode/auth.json)'}
        ]);
        return {type: 'submit', value: 'use-discovered'};
      },
      (_spec, history) => {
        expect(history.map(item => item.screen)).toEqual(['opencode-discovery']);
        return {type: 'submit', value: 'azure/gpt-5.4'};
      },
      spec => {
        expect(spec.prompt).toBe('Select default policy');
        expect(spec.options[0]?.value).toBe('typescript-baseline');
        expect(spec.noteLines).toEqual([
          '',
          'Other defaults are written automatically:',
          'native • uncommitted • auto • markdown'
        ]);
        return {type: 'submit', value: 'typescript-baseline'};
      },
      spec => {
        expect(spec.prompt).toBe('Setup complete');
        expect(spec.summaryItems).toEqual([
          {label: 'Provider', value: 'azure'},
          {label: 'Model', value: 'azure/gpt-5.4'},
          {label: 'Default policy', value: 'typescript-baseline'},
          {label: 'Runtime mode', value: 'native'}
        ]);
        return {type: 'submit', value: 'run-scan'};
      }
    ]);
    mockCreateInitUiSession.mockReturnValue(session);

    const result = await runInitCommand({
      cwd: repoRoot,
      force: false
    });

    session.assertFinished();
    expect(session.suspend).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      repoRoot,
      action: 'run-scan',
      wroteFiles: true,
      projectConfigPath: path.join(repoRoot, '.openshrike', 'project.json'),
      opencodeConfigPath: path.join(repoRoot, '.openshrike', 'opencode.json'),
      readmePath: path.join(repoRoot, '.openshrike', 'README.md')
    });

    const projectConfig = await loadProjectConfig(result.projectConfigPath);
    const runtimeConfig = await loadRuntimeConfig(result.opencodeConfigPath, {
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4'
    });

    expect(projectConfig.config.init.projectType).toBe('typescript');
    expect(projectConfig.config.init.opencodeSetup).toBe('existing-config');
    expect(projectConfig.config.init.detectedFrom).toHaveLength(3);
    expect(projectConfig.config.init.detectedFrom).toEqual(expect.arrayContaining([
      'package.json',
      'tsconfig.json',
      'src/**/*.ts'
    ]));
    expect(projectConfig.config.runtime).toEqual({
      configPath: '.openshrike/opencode.json',
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4',
      mode: 'native',
      parallelism: 'auto'
    });
    expect(projectConfig.config.scan).toEqual({
      defaultKind: 'policy',
      defaultId: 'typescript-baseline',
      repo: '.',
      scope: 'uncommitted',
      output: 'markdown',
      ui: true,
      artifactsDir: null
    });
    expect(runtimeConfig.config.model).toBe('azure/gpt-5.4');
    expect(runtimeConfig.config.agent?.['shrike-checker']?.model).toBe('azure/gpt-5.4');
  });

  it('continues from auth-only OpenCode setup and writes the selected model to the repo-local config', async () => {
    const repoRoot = await makeTypescriptRepo();
    const {binaryPath, homeRoot} = await makeDiscoveredOpenCodeHome({
      models: ['azure/gpt-5.4-mini', 'azure/gpt-5.4', 'openai/gpt-5.1-mini'],
      defaultModel: 'azure/gpt-5.4-mini',
      authPresent: true,
      includeBinary: true,
      configPresent: false
    });
    useHome(homeRoot, path.dirname(binaryPath));

    mockSpawn.mockImplementation((command: string, args: string[]) => {
      expect(command).toBe(binaryPath);

      if (args[0] === 'models') {
        return createSuccessfulProcessChild([
          'azure/gpt-5.4-mini',
          'azure/gpt-5.4',
          'openai/gpt-5.1-mini'
        ].join('\n'));
      }

      throw new Error(`Unexpected external command: ${command} ${args.join(' ')}`);
    });

    const session = createScriptedSession([
      spec => {
        expect(spec.prompt).toBe('OpenCode discovery');
        expect(spec.bodyLines).toEqual([
          'OpenCode credentials are ready. No user-global OpenCode config was found.',
          'Choose a model here and Shrike will save it in `.openshrike/opencode.json` for native scans.'
        ]);
        expect(spec.summaryItems).toEqual([
          {label: 'default model', value: 'not set'},
          {label: 'providers', value: 'azure, openai'},
          {label: 'config file', value: 'missing'},
          {label: 'auth store', value: 'present (~/.local/share/opencode/auth.json)'}
        ]);
        expect(spec.options.map(option => option.value)).toEqual([
          'use-discovered',
          'auth-login',
          'exit'
        ]);
        return {type: 'submit', value: 'use-discovered'};
      },
      spec => {
        expect(spec.prompt).toBe('Select default model');
        expect(spec.bodyLines).toEqual([
          'No global OpenCode config was found. Shrike will save the selected model in `.openshrike/opencode.json`.',
          'Smaller models are fine for local scans, e.g. `gpt-5.4-mini` or a Haiku-class model.'
        ]);
        return {type: 'submit', value: 'openai/gpt-5.1-mini'};
      },
      spec => {
        expect(spec.prompt).toBe('Select default policy');
        return {type: 'submit', value: 'typescript-baseline'};
      },
      spec => {
        expect(spec.prompt).toBe('Setup complete');
        expect(spec.summaryItems).toEqual([
          {label: 'Provider', value: 'openai'},
          {label: 'Model', value: 'openai/gpt-5.1-mini'},
          {label: 'Default policy', value: 'typescript-baseline'},
          {label: 'Runtime mode', value: 'native'}
        ]);
        return {type: 'submit', value: 'exit'};
      }
    ]);
    mockCreateInitUiSession.mockReturnValue(session);

    const result = await runInitCommand({
      cwd: repoRoot,
      force: false
    });

    session.assertFinished();
    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(result.wroteFiles).toBe(true);

    const projectConfig = await loadProjectConfig(path.join(repoRoot, '.openshrike', 'project.json'));
    const runtimeConfig = await loadRuntimeConfig(path.join(repoRoot, '.openshrike', 'opencode.json'), {
      agent: 'shrike-checker',
      model: 'openai/gpt-5.1-mini'
    });

    expect(projectConfig.config.init.opencodeSetup).toBe('auth-login');
    expect(projectConfig.config.runtime.model).toBe('openai/gpt-5.1-mini');
    expect(runtimeConfig.config.model).toBe('openai/gpt-5.1-mini');
    expect(runtimeConfig.config.provider).toBeUndefined();
  });

  it('re-enters an existing init, updates runtime defaults, and preserves the saved model and policy', async () => {
    const repoRoot = await makeTypescriptRepo();
    const {homeRoot} = await makeDiscoveredOpenCodeHome({
      models: ['azure/gpt-5.4-mini'],
      defaultModel: 'azure/gpt-5.4-mini',
      authPresent: true
    });
    useHome(homeRoot);

    await writeShrikeInitFiles({
      repoRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const session = createScriptedSession([
      spec => {
        expect(spec.prompt).toBe('Project is already initialized');
        expect(spec.initialValue).toBe('update');
        expect(spec.summaryItems).toEqual([
          {label: 'policy', value: 'typescript-baseline'},
          {label: 'model', value: 'azure/gpt-5.4-mini'}
        ]);
        return {type: 'submit', value: 'update'};
      },
      spec => {
        expect(spec.prompt).toBe('Change saved defaults');
        expect(spec.options.map(option => option.value)).toEqual([
          'policy',
          'runtime',
          'done'
        ]);
        return {type: 'submit', value: 'runtime'};
      },
      spec => {
        expect(spec.prompt).toBe('Select runtime mode');
        expect(spec.initialValue).toBe('native');
        return {type: 'submit', value: 'docker'};
      },
      spec => {
        expect(spec.prompt).toBe('Change saved defaults');
        expect(spec.options.map(option => option.label)).toContain('Runtime: docker');
        return {type: 'submit', value: 'done'};
      },
      spec => {
        expect(spec.prompt).toBe('Setup complete');
        expect(spec.summaryItems).toEqual([
          {label: 'Provider', value: 'azure'},
          {label: 'Model', value: 'azure/gpt-5.4-mini'},
          {label: 'Default policy', value: 'typescript-baseline'},
          {label: 'Runtime mode', value: 'docker'}
        ]);
        return {type: 'submit', value: 'exit'};
      }
    ]);
    mockCreateInitUiSession.mockReturnValue(session);

    const result = await runInitCommand({
      cwd: repoRoot,
      force: false
    });

    session.assertFinished();
    expect(result.action).toBe('exit');
    expect(result.wroteFiles).toBe(true);

    const projectConfig = await loadProjectConfig(path.join(repoRoot, '.openshrike', 'project.json'));
    expect(projectConfig.config.runtime.mode).toBe('docker');
    expect(projectConfig.config.runtime.model).toBe('azure/gpt-5.4-mini');
    expect(projectConfig.config.scan.defaultId).toBe('typescript-baseline');
    expect(projectConfig.config.init.detectedFrom).toEqual(['package.json', 'tsconfig.json']);
  });

  it('runs auth login, refreshes OpenCode discovery, and continues even when OpenCode did not create a global config file', async () => {
    const repoRoot = await makeTypescriptRepo();
    const {authPath, binaryPath, homeRoot} = await makeDiscoveredOpenCodeHome({
      models: ['azure/gpt-5.4-mini', 'azure/gpt-5.4'],
      defaultModel: 'azure/gpt-5.4-mini',
      authPresent: false,
      includeBinary: true,
      configPresent: false
    });
    useHome(homeRoot, path.dirname(binaryPath));

    mockSpawn.mockImplementation((command: string, args: string[], options: Record<string, unknown>) => {
      expect(command).toBe(binaryPath);

      if (args[0] === 'auth' && args[1] === 'login') {
        expect(options.cwd).toBe(repoRoot);
        expect(options.shell).toBe(false);
        expect(options.stdio).toBe('inherit');
        const child = createMockChild();
        void fs.mkdir(path.dirname(authPath), {recursive: true})
          .then(() => fs.writeFile(authPath, '{"token":"test"}\n', 'utf8'))
          .then(() => {
            queueMicrotask(() => {
              child.emit('close', 0, null);
            });
          });
        return child;
      }

      if (args[0] === 'models') {
        expect(options.cwd).toBe(repoRoot);
        return createSuccessfulProcessChild([
          'azure/gpt-5.4-mini',
          'azure/gpt-5.4'
        ].join('\n'));
      }

      throw new Error(`Unexpected external command: ${command} ${args.join(' ')}`);
    });

    const session = createScriptedSession([
      spec => {
        expect(spec.prompt).toBe('OpenCode authentication required');
        expect(spec.options.map(option => option.value)).toEqual([
          'auth-login',
          'exit'
        ]);
        return {type: 'submit', value: 'auth-login'};
      },
      spec => {
        expect(spec.prompt).toBe('OpenCode discovery');
        expect(spec.summaryItems).toEqual([
          {label: 'default model', value: 'not set'},
          {label: 'providers', value: 'azure'},
          {label: 'config file', value: 'missing'},
          {label: 'auth store', value: 'present (~/.local/share/opencode/auth.json)'}
        ]);
        expect(spec.options.map(option => option.value)).toEqual([
          'use-discovered',
          'auth-login',
          'exit'
        ]);
        return {type: 'submit', value: 'use-discovered'};
      },
      spec => {
        expect(spec.prompt).toBe('Select default model');
        return {type: 'submit', value: 'azure/gpt-5.4-mini'};
      },
      spec => {
        expect(spec.prompt).toBe('Select default policy');
        return {type: 'submit', value: 'typescript-baseline'};
      },
      spec => {
        expect(spec.prompt).toBe('Setup complete');
        return {type: 'submit', value: 'exit'};
      }
    ]);
    mockCreateInitUiSession.mockReturnValue(session);

    const result = await runInitCommand({
      cwd: repoRoot,
      force: false
    });

    session.assertFinished();
    expect(session.suspend).toHaveBeenCalledOnce();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(await fs.readFile(authPath, 'utf8')).toContain('token');
    expect(result.wroteFiles).toBe(true);

    const projectConfig = await loadProjectConfig(path.join(repoRoot, '.openshrike', 'project.json'));
    expect(projectConfig.config.init.opencodeSetup).toBe('auth-login');
    expect(projectConfig.config.runtime.model).toBe('azure/gpt-5.4-mini');
  });
});

function createScriptedSession(handlers: ScreenHandler[]) {
  const queue = [...handlers];

  return {
    showScreen: vi.fn(async (spec: InitScreenSpec<string>, history: InitHistoryItem[]) => {
      const next = queue.shift();
      if (!next) {
        throw new Error(`Unexpected screen: ${spec.prompt}`);
      }

      return await next(spec, history);
    }),
    suspend: vi.fn(),
    close: vi.fn(),
    assertFinished() {
      expect(queue).toHaveLength(0);
    }
  };
}

async function makeTypescriptRepo(): Promise<string> {
  const repoRoot = await makeTempDirectory('openshrike-init-flow-repo-');
  await fs.mkdir(path.join(repoRoot, '.git'));
  await fs.mkdir(path.join(repoRoot, 'src'));
  await fs.writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture-repo',
      private: true,
      devDependencies: {
        typescript: '^5.9.0'
      }
    }, null, 2),
    'utf8'
  );
  await fs.writeFile(path.join(repoRoot, 'tsconfig.json'), '{\n  "compilerOptions": {}\n}\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
  return repoRoot;
}

async function makeDiscoveredOpenCodeHome(options: {
  models: string[];
  defaultModel: string;
  authPresent: boolean;
  includeBinary?: boolean | undefined;
  configPresent?: boolean | undefined;
}): Promise<{
  homeRoot: string;
  configPath: string;
  authPath: string;
  binaryPath: string;
}> {
  const homeRoot = await makeTempDirectory('openshrike-init-flow-home-');
  const configPath = path.join(homeRoot, '.config', 'opencode', 'opencode.json');
  const authPath = path.join(homeRoot, '.local', 'share', 'opencode', 'auth.json');
  const providerId = options.defaultModel.includes('/')
    ? options.defaultModel.split('/')[0]!
    : 'azure';

  if (options.configPresent ?? true) {
    await fs.mkdir(path.dirname(configPath), {recursive: true});
    await fs.writeFile(
      configPath,
      `${serializeConfig({
        model: options.defaultModel,
        provider: {
          [providerId]: {
            models: Object.fromEntries(
              options.models.map(modelId => [stripProviderPrefix(modelId), {}])
            )
          }
        }
      })}\n`,
      'utf8'
    );
  }

  if (options.authPresent) {
    await fs.mkdir(path.dirname(authPath), {recursive: true});
    await fs.writeFile(authPath, '{"token":"test"}\n', 'utf8');
  }

  const binaryPath = await createOpencodeBinary(homeRoot, Boolean(options.includeBinary));
  return {
    homeRoot,
    configPath,
    authPath,
    binaryPath
  };
}

async function createOpencodeBinary(homeRoot: string, includeBinary: boolean): Promise<string> {
  const binDirectory = path.join(homeRoot, 'bin');
  await fs.mkdir(binDirectory, {recursive: true});

  if (process.platform === 'win32') {
    const binaryPath = path.join(binDirectory, 'opencode.cmd');
    if (includeBinary) {
      await fs.writeFile(binaryPath, '@echo off\r\n', 'utf8');
    }
    return binaryPath;
  }

  const binaryPath = path.join(binDirectory, 'opencode');
  if (includeBinary) {
    await fs.writeFile(binaryPath, '#!/usr/bin/env bash\n', 'utf8');
    await fs.chmod(binaryPath, 0o755);
  }
  return binaryPath;
}

function useHome(homeRoot: string, extraPath?: string): void {
  process.env.HOME = homeRoot;
  process.env.USERPROFILE = homeRoot;
  const pathSegments = [extraPath, originalPath].filter((segment): segment is string => Boolean(segment));
  process.env.PATH = pathSegments.join(path.delimiter);
}

function createSuccessfulProcessChild(stdout: string) {
  const child = createMockChild();
  queueMicrotask(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout));
    }
    child.emit('close', 0, null);
  });
  return child;
}

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function stripProviderPrefix(modelId: string): string {
  const separator = modelId.indexOf('/');
  return separator >= 0 ? modelId.slice(separator + 1) : modelId;
}

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function restoreEnv(name: 'HOME' | 'USERPROFILE' | 'PATH', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function setTty(stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean): void {
  Object.defineProperty(stream, 'isTTY', {
    configurable: true,
    value
  });
}

function restoreTty(
  stream: NodeJS.ReadStream | NodeJS.WriteStream,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(stream, 'isTTY', descriptor);
    return;
  }

  delete (stream as {isTTY?: boolean}).isTTY;
}
