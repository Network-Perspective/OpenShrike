import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {
  CONFIG_DIRECTORY_NAME,
  OUTPUT_VALUES,
  PROJECT_CONFIG_FILE_NAME,
  RUNTIME_MODE_VALUES,
  SCOPE_VALUES
} from './constants.js';
import type {ShrikeProjectConfig} from './types.js';

const projectParallelismSchema = z.union([
  z.literal('auto'),
  z.coerce.number().int().min(1)
]);

const projectConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    version: z.literal(1),
    init: z.object({
      projectType: z.enum([
        'typescript',
        'javascript',
        'python',
        'python-ml',
        'pytorch',
        'csharp',
        'go',
        'java',
        'shared'
      ]),
      detectedFrom: z.array(z.string().trim().min(1)).default([]),
      opencodeSetup: z.enum(['existing-config', 'auth-login']),
      seedPolicyId: z.string().trim().min(1).optional()
    }).passthrough(),
    runtime: z.object({
      configPath: z.string().trim().min(1),
      agent: z.string().trim().min(1),
      model: z.string().trim().min(1).optional(),
      mode: z.enum(RUNTIME_MODE_VALUES),
      parallelism: projectParallelismSchema
    }).passthrough(),
    scan: z.object({
      defaultKind: z.enum(['check', 'policy', 'project-checks']),
      defaultId: z.string().trim().min(1),
      repo: z.string().trim().min(1),
      scope: z.enum(SCOPE_VALUES),
      output: z.enum(OUTPUT_VALUES),
      ui: z.boolean(),
      artifactsDir: z.string().trim().min(1).nullable()
    }).passthrough()
  })
  .passthrough();

export interface LoadedProjectConfig {
  configPath: string;
  repoRoot: string;
  config: ShrikeProjectConfig;
}

export function getDefaultProjectConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, CONFIG_DIRECTORY_NAME, PROJECT_CONFIG_FILE_NAME);
}

export async function loadProjectConfig(
  configPath = getDefaultProjectConfigPath()
): Promise<LoadedProjectConfig> {
  const absolutePath = path.resolve(configPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  return parseProjectConfigContent(raw, absolutePath);
}

export async function loadProjectConfigForRepo(repoPath: string): Promise<LoadedProjectConfig | null> {
  const discoveredPath = await findNearestProjectConfigPath(path.resolve(repoPath));
  if (!discoveredPath) {
    return null;
  }

  return await loadProjectConfig(discoveredPath);
}

export async function findNearestProjectConfigPath(startPath: string): Promise<string | null> {
  let current = path.resolve(startPath);

  while (true) {
    const candidate = getDefaultProjectConfigPath(current);
    try {
      await fs.access(candidate);
      return candidate;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolveProjectConfigRelativePath(
  loaded: LoadedProjectConfig,
  relativePath: string
): string {
  return path.resolve(loaded.repoRoot, relativePath);
}

export function resolveOptionalProjectConfigRelativePath(
  loaded: LoadedProjectConfig,
  relativePath: string | null
): string | undefined {
  if (!relativePath) {
    return undefined;
  }

  return resolveProjectConfigRelativePath(loaded, relativePath);
}

export async function loadProjectConfigIfPresent(
  configPath = getDefaultProjectConfigPath()
): Promise<LoadedProjectConfig | null> {
  try {
    return await loadProjectConfig(configPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export function parseProjectConfigContent(raw: string, configPath: string): LoadedProjectConfig {
  const parsed = projectConfigSchema.parse(JSON.parse(raw)) as ShrikeProjectConfig;

  return {
    configPath,
    repoRoot: path.resolve(path.dirname(configPath), '..'),
    config: parsed
  };
}

export async function writeProjectConfig(
  configPath: string,
  config: ShrikeProjectConfig
): Promise<void> {
  const absolutePath = path.resolve(configPath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, `${serializeProjectConfig(config)}\n`, 'utf8');
}

export function serializeProjectConfig(config: ShrikeProjectConfig): string {
  return JSON.stringify(config, null, 2);
}

function isNotFoundError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  return nodeError?.code === 'ENOENT';
}
