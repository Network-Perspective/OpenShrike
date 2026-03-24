import fs from 'node:fs/promises';
import path from 'node:path';
import type {Config} from '@opencode-ai/sdk';
import {
  AZURE_API_VERSION_ENV,
  AZURE_BASE_URL_ENV,
  AZURE_API_KEY_ENV,
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_AGENT_NAME,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER
} from './constants.js';
import {findToolRoot} from './project-root.js';

const ENV_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

export interface LoadedRuntimeConfig {
  configPath: string;
  config: Config;
  requiredEnvVars: string[];
  missingEnvVars: string[];
}

export function getDefaultConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME);
}

export async function loadRuntimeConfig(
  configPath = getDefaultConfigPath(),
  options?: {
    agent?: string | undefined;
    model?: string | undefined;
  }
): Promise<LoadedRuntimeConfig> {
  const absolutePath = path.resolve(configPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Config;

  const placeholderVars = collectEnvPlaceholders(parsed);
  const declaredVars = collectDeclaredEnvVars(parsed);
  const requiredEnvVars = [...new Set([...placeholderVars, ...declaredVars])].sort();

  const missingEnvVars = requiredEnvVars.filter(name => !process.env[name]);
  const resolved = resolveEnvPlaceholders(parsed);

  const runtimeConfig = ensureShrikeAgent(resolved, options);
  return {
    configPath: absolutePath,
    config: runtimeConfig,
    requiredEnvVars,
    missingEnvVars
  };
}

export function buildDefaultOpencodeConfig(): Config {
  return {
    $schema: 'https://opencode.ai/config.json',
    model: DEFAULT_MODEL,
    provider: {
      [DEFAULT_PROVIDER]: {
        env: [AZURE_API_KEY_ENV, AZURE_BASE_URL_ENV, AZURE_API_VERSION_ENV],
        options: {
          apiKey: `\${${AZURE_API_KEY_ENV}}`,
          baseURL: `\${${AZURE_BASE_URL_ENV}}`,
          queryParams: {
            'api-version': `\${${AZURE_API_VERSION_ENV}}`
          }
        },
        models: {
          'gpt-5.4-mini': {
            name: 'gpt-5.4-mini'
          }
        }
      }
    },
    permission: {
      bash: 'allow',
      edit: 'deny',
      webfetch: 'deny',
      doom_loop: 'deny',
      external_directory: 'deny'
    },
    agent: {
      [DEFAULT_AGENT_NAME]: {
        description: 'Runs OpenShrike checks in a read-only review session.',
        model: DEFAULT_MODEL,
        permission: {
          bash: 'allow',
          edit: 'deny',
          webfetch: 'deny',
          doom_loop: 'deny',
          external_directory: 'deny'
        }
      }
    }
  };
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config, null, 2);
}

export function ensureLocalNodeBinsOnPath(): void {
  const toolRoot = findToolRoot();
  const binDirectory = path.join(toolRoot, 'node_modules', '.bin');
  const currentPath = process.env.PATH ?? '';
  const segments = currentPath.split(path.delimiter).filter(Boolean);

  if (!segments.includes(binDirectory)) {
    process.env.PATH = [binDirectory, ...segments].join(path.delimiter);
  }
}

function ensureShrikeAgent(
  config: Config,
  options?: {
    agent?: string | undefined;
    model?: string | undefined;
  }
): Config {
  const defaultModel = options?.model?.trim() || config.model || DEFAULT_MODEL;
  const defaultAgentConfig: NonNullable<NonNullable<Config['agent']>[string]> =
    config.agent?.[DEFAULT_AGENT_NAME] ?? buildDefaultAgentConfig(defaultModel, config.permission);

  const agentName = options?.agent?.trim() || DEFAULT_AGENT_NAME;
  const agent = {
    ...config.agent,
    [agentName]: {
      ...defaultAgentConfig,
      model: options?.model?.trim() || defaultAgentConfig.model || defaultModel
    }
  };

  return {
    ...config,
    model: defaultModel,
    agent
  };
}

function buildDefaultAgentConfig(
  model: string,
  permission: Config['permission']
): NonNullable<NonNullable<Config['agent']>[string]> {
  return {
    description: 'Runs OpenShrike checks in a read-only review session.',
    model,
    ...(permission ? {permission} : {})
  };
}

function collectEnvPlaceholders(value: unknown): string[] {
  const found = new Set<string>();

  visit(value, node => {
    if (typeof node !== 'string') {
      return;
    }

    for (const match of node.matchAll(ENV_PATTERN)) {
      if (match[1]) {
        found.add(match[1]);
      }
    }
  });

  return [...found];
}

function collectDeclaredEnvVars(config: Config): string[] {
  const result = new Set<string>();
  for (const provider of Object.values(config.provider ?? {})) {
    for (const envVar of provider?.env ?? []) {
      if (envVar) {
        result.add(envVar);
      }
    }
  }

  return [...result];
}

function resolveEnvPlaceholders<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => resolveEnvPlaceholders(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, resolveEnvPlaceholders(item)]);
    return Object.fromEntries(entries) as T;
  }

  if (typeof value === 'string') {
    return value.replaceAll(ENV_PATTERN, (_, envVar: string) => process.env[envVar] ?? `\${${envVar}}`) as T;
  }

  return value;
}

function visit(value: unknown, callback: (value: unknown) => void): void {
  callback(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, callback);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      visit(item, callback);
    }
  }
}
