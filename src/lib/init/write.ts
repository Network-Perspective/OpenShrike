import fs from 'node:fs/promises';
import path from 'node:path';
import type {Config} from '@opencode-ai/sdk';
import {resolveCheckDefinitionPath} from '../checks.js';
import {buildDefaultOpencodeConfig, serializeConfig} from '../config.js';
import {
  ARTIFACTS_DIRECTORY_NAME,
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_AGENT_NAME,
  DEFAULT_OUTPUT,
  DEFAULT_PARALLELISM,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SCAN_SCOPE,
  GITIGNORE_FILE_NAME,
  INIT_README_FILE_NAME,
  PROJECT_CHECKS_DIRECTORY_NAME,
  PROJECT_CONFIG_FILE_NAME
} from '../constants.js';
import {resolvePolicyDefinition} from '../policies.js';
import {serializeProjectConfig, writeProjectConfig} from '../project-config.js';
import type {ParallelismValue, ProjectType, RuntimeMode, ShrikeProjectConfig} from '../types.js';

type JsonRecord = Record<string, unknown>;

export type InitWriteScope = 'all' | 'project' | 'project-and-opencode';
export type ProjectConfigPatch = 'full' | 'policy' | 'model' | 'runtime' | 'parallelism';

export interface InitWriteOptions {
  repoRoot: string;
  policyId: string;
  model?: string | undefined;
  runtimeMode?: RuntimeMode | undefined;
  parallelism?: ParallelismValue | undefined;
  projectType: ProjectType;
  detectedFrom: string[];
  opencodeSetup: 'existing-config' | 'auth-login';
  scope?: InitWriteScope | undefined;
  preserveExisting?: boolean | undefined;
  projectPatch?: ProjectConfigPatch | undefined;
}

export interface InitWriteResult {
  configDirectory: string;
  checksDirectory: string;
  opencodeConfigPath: string;
  projectConfigPath: string;
  readmePath: string;
  gitignorePath: string;
  seededCheckPaths: string[];
  projectConfig: ShrikeProjectConfig;
}

export async function writeShrikeInitFiles(options: InitWriteOptions): Promise<InitWriteResult> {
  const configDirectory = path.join(options.repoRoot, CONFIG_DIRECTORY_NAME);
  const checksDirectory = path.join(configDirectory, PROJECT_CHECKS_DIRECTORY_NAME);
  const opencodeConfigPath = path.join(configDirectory, CONFIG_FILE_NAME);
  const projectConfigPath = path.join(configDirectory, PROJECT_CONFIG_FILE_NAME);
  const readmePath = path.join(configDirectory, INIT_README_FILE_NAME);
  const gitignorePath = path.join(configDirectory, GITIGNORE_FILE_NAME);
  const scope = options.scope ?? 'all';
  const preserveExisting = options.preserveExisting ?? false;
  const projectPatch = options.projectPatch ?? 'full';
  const existingProjectConfig = preserveExisting && shouldWriteProjectConfig(scope)
    ? await readJsonObjectIfPresent(projectConfigPath, 'project config')
    : null;
  const existingRuntimeConfig = preserveExisting && shouldWriteRuntimeConfig(scope)
    ? await readJsonObjectIfPresent(opencodeConfigPath, 'OpenCode config')
    : null;
  const projectConfig = mergeProjectConfig(
    existingProjectConfig,
    buildShrikeProjectConfig({
      policyId: options.policyId,
      model: options.model,
      runtimeMode: options.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      parallelism: options.parallelism ?? DEFAULT_PARALLELISM,
      projectType: options.projectType,
      detectedFrom: options.detectedFrom,
      opencodeSetup: options.opencodeSetup
    }),
    projectPatch
  );
  const runtimeConfig = mergeRuntimeConfig(
    existingRuntimeConfig,
    buildDefaultOpencodeConfig(options.model)
  );
  const readme = buildInitReadme({
    checksDirectory,
    projectConfigPath,
    opencodeConfigPath
  });

  await fs.mkdir(configDirectory, {recursive: true});

  if (shouldSeedProjectChecks(scope, projectPatch)) {
    await fs.mkdir(checksDirectory, {recursive: true});
  }

  if (shouldWriteRuntimeConfig(scope)) {
    await writeJsonFileIfChanged(
      opencodeConfigPath,
      existingRuntimeConfig,
      runtimeConfig,
      serializeConfig
    );
  }

  if (shouldWriteProjectConfig(scope)) {
    if (!existingProjectConfig || JSON.stringify(existingProjectConfig) !== JSON.stringify(projectConfig)) {
      await writeProjectConfig(projectConfigPath, projectConfig);
    }
  }

  const seededCheckPaths = shouldSeedProjectChecks(scope, projectPatch)
    ? await seedProjectChecksDirectory({
        checksDirectory,
        policyId: options.policyId
      })
    : [];

  if (scope === 'all') {
    await ensureConfigGitignore(gitignorePath);
    await writeTextFileIfChanged(readmePath, readme);
  }

  return {
    configDirectory,
    checksDirectory,
    opencodeConfigPath,
    projectConfigPath,
    readmePath,
    gitignorePath,
    seededCheckPaths,
    projectConfig
  };
}

export function buildShrikeProjectConfig(options: {
  policyId: string;
  model?: string | undefined;
  runtimeMode: RuntimeMode;
  parallelism: ParallelismValue;
  projectType: ProjectType;
  detectedFrom: string[];
  opencodeSetup: 'existing-config' | 'auth-login';
}): ShrikeProjectConfig {
  return {
    $schema: 'https://openshrike.dev/schema/project.json',
    version: 1,
    init: {
      projectType: options.projectType,
      detectedFrom: options.detectedFrom,
      opencodeSetup: options.opencodeSetup,
      seedPolicyId: options.policyId
    },
    runtime: {
      configPath: path.posix.join(CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME),
      agent: DEFAULT_AGENT_NAME,
      ...(options.model ? {model: options.model} : {}),
      mode: options.runtimeMode,
      parallelism: options.parallelism
    },
    scan: {
      defaultKind: 'project-checks',
      defaultId: path.posix.join(CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME),
      repo: '.',
      scope: DEFAULT_SCAN_SCOPE,
      output: DEFAULT_OUTPUT,
      ui: true,
      artifactsDir: null
    }
  };
}

export function buildInitReadme(options?: {
  checksDirectory?: string | undefined;
  projectConfigPath?: string | undefined;
  opencodeConfigPath?: string | undefined;
}): string {
  const checksLabel = path.basename(options?.checksDirectory ?? PROJECT_CHECKS_DIRECTORY_NAME);
  const projectConfigLabel = path.basename(options?.projectConfigPath ?? PROJECT_CONFIG_FILE_NAME);
  const opencodeConfigLabel = path.basename(options?.opencodeConfigPath ?? CONFIG_FILE_NAME);

  return [
    '# OpenShrike Init',
    '',
    'This directory is generated by `shrike init`.',
    '',
    `- \`${checksLabel}/\` stores the project-local Markdown checks that Shrike executes.`,
    `- \`${projectConfigLabel}\` stores repo-local Shrike defaults such as the selected policy and scan settings.`,
    `- \`${opencodeConfigLabel}\` is a Shrike-owned OpenCode overlay for read-only scans.`,
    `- \`.gitignore\` keeps generated \`${ARTIFACTS_DIRECTORY_NAME}/\` files out of version control.`,
    '- User-global OpenCode config and credentials remain outside this repository.',
    '',
    'Re-run `shrike init` to seed additional checks from a different policy or choose different saved defaults.',
    'After initialization, `shrike scan` reads Markdown checks from `checks/` and uses these saved defaults automatically.'
  ].join('\n') + '\n';
}

export function serializeShrikeProjectConfig(config: ShrikeProjectConfig): string {
  return serializeProjectConfig(config);
}

async function seedProjectChecksDirectory(options: {
  checksDirectory: string;
  policyId: string;
}): Promise<string[]> {
  const policy = await resolvePolicyDefinition(options.policyId);
  const seededPaths: string[] = [];

  for (const checkId of policy.checkIds) {
    const sourcePath = await resolveCheckDefinitionPath(checkId);
    const targetPath = path.join(options.checksDirectory, path.basename(sourcePath));
    const targetStats = await fs.stat(targetPath).catch(error => isNotFoundError(error) ? null : Promise.reject(error));

    if (targetStats?.isDirectory()) {
      throw new Error(`Cannot seed check '${checkId}' because '${targetPath}' is a directory.`);
    }

    if (!targetStats) {
      const definition = await fs.readFile(sourcePath, 'utf8');
      await fs.writeFile(targetPath, ensureTrailingNewline(definition), 'utf8');
    }

    seededPaths.push(targetPath);
  }

  return seededPaths;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function mergeProjectConfig(
  existingConfig: JsonRecord | null,
  projectConfig: ShrikeProjectConfig,
  patch: ProjectConfigPatch
): ShrikeProjectConfig {
  if (!existingConfig) {
    return projectConfig;
  }

  const baseInit = {
    ...projectConfig.init,
    ...asJsonRecord(existingConfig.init)
  };
  const baseRuntime = {
    ...projectConfig.runtime,
    ...asJsonRecord(existingConfig.runtime)
  };
  const baseScan = {
    ...projectConfig.scan,
    ...asJsonRecord(existingConfig.scan)
  };
  const nextInit = patch === 'full'
    ? {
        ...baseInit,
        ...projectConfig.init
      }
    : patch === 'policy'
      ? {
          ...baseInit,
          seedPolicyId: projectConfig.init.seedPolicyId
        }
      : baseInit;
  const nextRuntime = patch === 'full'
    ? {
        ...baseRuntime,
        ...projectConfig.runtime
      }
    : patch === 'model'
      ? {
          ...baseRuntime,
          ...(projectConfig.runtime.model ? {model: projectConfig.runtime.model} : {})
        }
      : patch === 'runtime'
        ? {
            ...baseRuntime,
            mode: projectConfig.runtime.mode
          }
        : patch === 'parallelism'
          ? {
              ...baseRuntime,
              parallelism: projectConfig.runtime.parallelism
            }
          : baseRuntime;
  const nextScan = patch === 'full'
    ? {
        ...baseScan,
        ...projectConfig.scan
      }
    : patch === 'policy'
      ? {
          ...baseScan,
          defaultKind: projectConfig.scan.defaultKind,
          defaultId: projectConfig.scan.defaultId
        }
      : baseScan;

  return {
    ...existingConfig,
    $schema: typeof existingConfig.$schema === 'string' ? existingConfig.$schema : projectConfig.$schema,
    version: projectConfig.version,
    init: nextInit,
    runtime: nextRuntime,
    scan: nextScan
  } as ShrikeProjectConfig;
}

function mergeRuntimeConfig(
  existingConfig: JsonRecord | null,
  runtimeConfig: Config
): Config {
  if (!existingConfig) {
    return runtimeConfig;
  }

  const existingAgentConfig = asJsonRecord(existingConfig.agent);
  const shrikeAgentConfig = {
    ...asJsonRecord(asJsonRecord(runtimeConfig.agent)?.[DEFAULT_AGENT_NAME]),
    ...asJsonRecord(existingAgentConfig[DEFAULT_AGENT_NAME]),
    ...(typeof runtimeConfig.model === 'string' ? {model: runtimeConfig.model} : {})
  };

  return {
    ...existingConfig,
    ...(hasOwnProperty(existingConfig, '$schema') || !runtimeConfig.$schema ? {} : {$schema: runtimeConfig.$schema}),
    ...(typeof runtimeConfig.model === 'string' ? {model: runtimeConfig.model} : {}),
    ...(hasOwnProperty(existingConfig, 'permission') || !runtimeConfig.permission
      ? {}
      : {permission: runtimeConfig.permission}),
    agent: {
      ...existingAgentConfig,
      [DEFAULT_AGENT_NAME]: shrikeAgentConfig
    }
  } as Config;
}

function shouldWriteProjectConfig(scope: InitWriteScope): boolean {
  return scope === 'all' || scope === 'project' || scope === 'project-and-opencode';
}

function shouldWriteRuntimeConfig(scope: InitWriteScope): boolean {
  return scope === 'all' || scope === 'project-and-opencode';
}

function shouldSeedProjectChecks(scope: InitWriteScope, projectPatch: ProjectConfigPatch): boolean {
  return scope === 'all' || (scope === 'project' && projectPatch === 'policy');
}

function asJsonRecord(value: unknown): JsonRecord {
  return isJsonRecord(value) ? value : {};
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnProperty(target: JsonRecord, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, property);
}

async function readJsonObjectIfPresent(filePath: string, label: string): Promise<JsonRecord | null> {
  try {
    return await readJsonObject(filePath, label);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function readJsonObject(filePath: string, label: string): Promise<JsonRecord> {
  const raw = await fs.readFile(filePath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse existing ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!isJsonRecord(parsed)) {
    throw new Error(`Expected existing ${label} at ${filePath} to contain a JSON object.`);
  }

  return parsed;
}

async function writeJsonFileIfChanged<T extends object>(
  filePath: string,
  existingConfig: JsonRecord | null,
  nextConfig: T,
  serialize: (config: T) => string
): Promise<void> {
  if (existingConfig && JSON.stringify(existingConfig) === JSON.stringify(nextConfig)) {
    return;
  }

  await fs.writeFile(filePath, `${serialize(nextConfig)}\n`, 'utf8');
}

async function writeTextFileIfChanged(filePath: string, nextContent: string): Promise<void> {
  try {
    const existingContent = await fs.readFile(filePath, 'utf8');
    if (existingContent === nextContent) {
      return;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  await fs.writeFile(filePath, nextContent, 'utf8');
}

async function ensureConfigGitignore(gitignorePath: string): Promise<void> {
  const existing = await fs.readFile(gitignorePath, 'utf8').catch(error => {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  });
  const entry = `${ARTIFACTS_DIRECTORY_NAME}/`;

  if (existing !== null) {
    const hasEntry = existing
      .split('\n')
      .map(line => line.trim())
      .some(line => line === entry || line === `/${entry}` || line === ARTIFACTS_DIRECTORY_NAME || line === `/${ARTIFACTS_DIRECTORY_NAME}`);
    if (hasEntry) {
      return;
    }

    const next = existing.trimEnd().length > 0
      ? `${existing.trimEnd()}\n${entry}\n`
      : `${entry}\n`;
    await fs.writeFile(gitignorePath, next, 'utf8');
    return;
  }

  await fs.writeFile(
    gitignorePath,
    [
      '# OpenShrike generated artifacts',
      entry,
      ''
    ].join('\n'),
    'utf8'
  );
}

function isNotFoundError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  return nodeError?.code === 'ENOENT';
}
