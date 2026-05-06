import fs from 'node:fs/promises';
import path from 'node:path';
import type {Config} from '@opencode-ai/sdk';
import {z} from 'zod';
import {
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_AGENT_NAME,
  DEFAULT_MODEL
} from './constants.js';
import {findToolRoot} from './project-root.js';

const ENV_PATTERN = /\$\{([A-Z0-9_]+)\}/g;
const runtimeConfigSchema = z
  .object({
    $schema: z.string().optional(),
    model: z.string().optional(),
    provider: z
      .record(
        z.string(),
        z
          .object({
            env: z.array(z.string()).optional(),
            options: z.record(z.string(), z.unknown()).optional(),
            models: z.record(z.string(), z.object({name: z.string().optional()}).passthrough()).optional()
          })
          .passthrough()
      )
      .optional(),
    permission: z.record(z.string(), z.string()).optional(),
    agent: z
      .record(
        z.string(),
        z
          .object({
            description: z.string().optional(),
            model: z.string().optional(),
            permission: z.record(z.string(), z.string()).optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

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
  return parseRuntimeConfigContent(raw, absolutePath, options);
}

export function parseRuntimeConfigContent(
  raw: string,
  configPath: string,
  options?: {
    agent?: string | undefined;
    model?: string | undefined;
  }
): LoadedRuntimeConfig {
  const parsed = runtimeConfigSchema.parse(JSON.parse(raw)) as Config;

  const placeholderVars = collectEnvPlaceholders(parsed);
  const declaredVars = collectDeclaredEnvVars(parsed);
  const requiredEnvVars = [...new Set(stripOptionalAzureEnvVars(parsed, [...placeholderVars, ...declaredVars]))].sort();

  const missingEnvVars = requiredEnvVars.filter(name => !process.env[name]);
  const resolved = resolveEnvPlaceholders(parsed);

  const runtimeConfig = ensureShrikeAgent(normalizeRuntimeConfig(resolved as Config), options);
  return {
    configPath,
    config: runtimeConfig,
    requiredEnvVars,
    missingEnvVars
  };
}

export function buildDefaultOpencodeConfig(model = DEFAULT_MODEL): Config {
  const permission: NonNullable<Config['permission']> = {
    bash: 'allow',
    edit: 'deny',
    webfetch: 'deny',
    doom_loop: 'deny',
    external_directory: 'deny'
  };

  return {
    $schema: 'https://opencode.ai/config.json',
    model,
    permission,
    agent: {
      [DEFAULT_AGENT_NAME]: {
        description: 'Runs OpenShrike checks in a read-only review session.',
        model,
        permission
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

function stripOptionalAzureEnvVars(config: Config, envVars: string[]): string[] {
  const azureOptions = config.provider?.azure?.options;
  if (
    !azureOptions ||
    typeof azureOptions !== 'object' ||
    typeof (azureOptions as Record<string, unknown>).baseURL !== 'string'
  ) {
    return envVars;
  }

  return envVars.filter(value => value !== 'OPENSHRIKE_AZURE_OPENAI_API_VERSION');
}

function normalizeRuntimeConfig(config: Config): Config {
  if (!config.provider?.azure) {
    return config;
  }

  const azureProvider = config.provider.azure;
  const options =
    azureProvider.options && typeof azureProvider.options === 'object'
      ? {...(azureProvider.options as Record<string, unknown>)}
      : null;

  if (!options) {
    return config;
  }

  if (typeof options.baseURL === 'string') {
    const resourceName = extractAzureResourceName(options.baseURL);
    if (resourceName) {
      options.resourceName = resourceName;
      delete options.baseURL;
    } else {
      options.baseURL = normalizeAzureBaseUrl(options.baseURL);
    }
  }

  if ('resourceName' in options) {
    delete options.apiVersion;
  }

  if (options.queryParams && typeof options.queryParams === 'object') {
    const queryParams = {...(options.queryParams as Record<string, unknown>)};
    delete queryParams['api-version'];
    if (Object.keys(queryParams).length === 0) {
      delete options.queryParams;
    } else {
      options.queryParams = queryParams;
    }
  }

  return {
    ...config,
    provider: {
      ...config.provider,
      azure: {
        ...azureProvider,
        options
      }
    }
  };
}

function normalizeAzureBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (/\/openai\/v1$/i.test(withoutTrailingSlash)) {
    return `${withoutTrailingSlash}/`;
  }

  if (/\/openai(?:\/.*)?$/i.test(withoutTrailingSlash)) {
    return `${withoutTrailingSlash.replace(/\/openai(?:\/.*)?$/i, '/openai/v1')}/`;
  }

  return `${withoutTrailingSlash}/openai/v1/`;
}

function extractAzureResourceName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const match = /^([^.]+)\.openai\.azure\.com$/i.exec(url.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
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
