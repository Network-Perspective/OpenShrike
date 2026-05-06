import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME, INIT_README_FILE_NAME, PROJECT_CONFIG_FILE_NAME} from '../constants.js';
import {loadProjectConfigIfPresent} from '../project-config.js';
import type {LoadedProjectConfig} from '../project-config.js';

interface DiscoveredOpenCodeConfig {
  providers: string[];
  models: string[];
  defaultModel: string | null;
}

export interface ExistingInitDiscovery {
  configDirectory: string;
  projectConfigPath: string;
  opencodeConfigPath: string;
  readmePath: string;
  existingFiles: string[];
  projectConfig: LoadedProjectConfig | null;
}

export interface DiscoveredOpenCodeSetup {
  status: 'ready' | 'needs-auth' | 'not-installed' | 'invalid-config' | 'no-models';
  configPath: string | null;
  authPath: string | null;
  binaryPath: string | null;
  providers: string[];
  models: string[];
  defaultModel: string | null;
  authPresent: boolean;
  errorMessage?: string | undefined;
}

export interface OpenCodeInstallOption {
  id: 'install-curl' | 'install-npm' | 'install-brew' | 'back';
  label: string;
  command?: string | undefined;
  args?: string[] | undefined;
  shell?: boolean | undefined;
}

export async function findRepoRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);

  while (true) {
    const gitPath = path.join(current, '.git');
    if (await pathExists(gitPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }

    current = parent;
  }
}

export async function discoverExistingInit(repoRoot: string): Promise<ExistingInitDiscovery> {
  const configDirectory = path.join(repoRoot, CONFIG_DIRECTORY_NAME);
  const projectConfigPath = path.join(configDirectory, PROJECT_CONFIG_FILE_NAME);
  const opencodeConfigPath = path.join(configDirectory, CONFIG_FILE_NAME);
  const readmePath = path.join(configDirectory, INIT_README_FILE_NAME);
  const existingFiles = (
    await Promise.all([
      projectConfigPath,
      opencodeConfigPath,
      readmePath
    ].map(async candidate => await pathExists(candidate) ? candidate : null))
  ).filter((candidate): candidate is string => Boolean(candidate));

  let projectConfig: LoadedProjectConfig | null = null;
  try {
    projectConfig = await loadProjectConfigIfPresent(projectConfigPath);
  } catch {
    projectConfig = null;
  }

  return {
    configDirectory,
    projectConfigPath,
    opencodeConfigPath,
    readmePath,
    existingFiles,
    projectConfig
  };
}

export async function discoverOpenCodeSetup(toolRoot: string): Promise<DiscoveredOpenCodeSetup> {
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
  const authPresent = await pathExists(authPath);
  const binaryPath = await resolveOpencodeBinary(toolRoot);

  if (!await pathExists(configPath)) {
    if (binaryPath) {
      return {
        status: 'needs-auth',
        configPath: null,
        authPath: authPresent ? authPath : null,
        binaryPath,
        providers: [],
        models: [],
        defaultModel: null,
        authPresent
      };
    }

    return {
      status: 'not-installed',
      configPath: null,
      authPath: authPresent ? authPath : null,
      binaryPath: null,
      providers: [],
      models: [],
      defaultModel: null,
      authPresent
    };
  }

  let parsedConfig: DiscoveredOpenCodeConfig;
  try {
    parsedConfig = extractDiscoveredOpenCodeConfig(
      JSON.parse(await fs.readFile(configPath, 'utf8'))
    );
  } catch (error) {
    return {
      status: 'invalid-config',
      configPath,
      authPath: authPresent ? authPath : null,
      binaryPath,
      providers: [],
      models: [],
      defaultModel: null,
      authPresent,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }

  if (parsedConfig.models.length === 0) {
    return {
      status: 'no-models',
      configPath,
      authPath: authPresent ? authPath : null,
      binaryPath,
      providers: parsedConfig.providers,
      models: [],
      defaultModel: parsedConfig.defaultModel,
      authPresent,
      errorMessage: 'No usable provider/model defaults were found in the discovered OpenCode config.'
    };
  }

  if (!authPresent) {
    return {
      status: binaryPath ? 'needs-auth' : 'not-installed',
      configPath,
      authPath: null,
      binaryPath,
      providers: parsedConfig.providers,
      models: parsedConfig.models,
      defaultModel: parsedConfig.defaultModel,
      authPresent
    };
  }

  return {
    status: 'ready',
    configPath,
    authPath,
    binaryPath,
    providers: parsedConfig.providers,
    models: parsedConfig.models,
    defaultModel: parsedConfig.defaultModel,
    authPresent
  };
}

export function getOpenCodeInstallOptions(): OpenCodeInstallOption[] {
  return [
    {
      id: 'install-curl',
      label: 'curl -fsSL https://opencode.ai/install | bash',
      command: 'bash',
      args: ['-lc', 'curl -fsSL https://opencode.ai/install | bash'],
      shell: false
    },
    {
      id: 'install-npm',
      label: 'npm install -g opencode-ai',
      command: 'npm',
      args: ['install', '-g', 'opencode-ai'],
      shell: false
    },
    {
      id: 'install-brew',
      label: 'brew install anomalyco/tap/opencode',
      command: 'brew',
      args: ['install', 'anomalyco/tap/opencode'],
      shell: false
    },
    {
      id: 'back',
      label: 'Back'
    }
  ];
}

async function resolveOpencodeBinary(toolRoot: string): Promise<string | null> {
  const pathResolved = await findExecutableOnPath('opencode');
  if (pathResolved) {
    return pathResolved;
  }

  const localCandidates = [
    path.join(toolRoot, 'node_modules', '.bin', 'opencode'),
    path.join(toolRoot, 'node_modules', '.bin', 'opencode.cmd')
  ];

  for (const candidate of localCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function findExecutableOnPath(commandName: string): Promise<string | null> {
  const pathValue = process.env.PATH ?? '';
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${commandName}${extension.toLowerCase()}`);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }

    if (process.platform !== 'win32') {
      const candidate = path.join(entry, commandName);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function extractDiscoveredOpenCodeConfig(value: unknown): DiscoveredOpenCodeConfig {
  const config = value && typeof value === 'object'
    ? value as {
        model?: unknown;
        provider?: Record<string, {models?: Record<string, unknown>} | undefined>;
      }
    : {};

  const providerRecord = config.provider && typeof config.provider === 'object'
    ? config.provider
    : {};
  const providers = Object.keys(providerRecord).sort();
  const models = new Set<string>();
  const defaultModel = typeof config.model === 'string' && config.model.trim()
    ? normalizeDiscoveredModelId(config.model.trim(), providers)
    : null;

  if (defaultModel) {
    models.add(defaultModel);
  }

  for (const [providerId, providerValue] of Object.entries(providerRecord)) {
    const providerModels = providerValue?.models;
    if (!providerModels || typeof providerModels !== 'object') {
      continue;
    }

    for (const modelId of Object.keys(providerModels)) {
      models.add(normalizeDiscoveredModelId(modelId, providers, providerId));
    }
  }

  return {
    providers,
    models: [...models].sort((left, right) => left.localeCompare(right)),
    defaultModel
  };
}

export function normalizeDiscoveredModelId(
  modelId: string,
  providers: string[],
  preferredProvider?: string | undefined
): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.includes('/')) {
    return trimmed;
  }

  const provider = preferredProvider ?? (providers.length === 1 ? providers[0] : undefined);
  return provider ? `${provider}/${trimmed}` : trimmed;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
