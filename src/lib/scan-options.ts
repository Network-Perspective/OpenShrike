import path from 'node:path';
import fs from 'node:fs/promises';
import {z} from 'zod';
import {getProjectChecksDirectory} from './checks.js';
import {
  DEFAULT_PARALLELISM,
  DEFAULT_OUTPUT,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SCAN_SCOPE,
  OUTPUT_VALUES,
  RUNTIME_MODE_VALUES,
  SCOPE_VALUES
} from './constants.js';
import {
  loadProjectConfigForRepo,
  resolveOptionalProjectConfigRelativePath,
  resolveProjectConfigRelativePath
} from './project-config.js';
import type {ScanCommandOptions} from './types.js';

const parallelismSchema = z.union([
  z.literal('auto'),
  z.coerce.number().int().min(1)
]);

const rawScanOptionsSchema = z.object({
  checkId: z.string().trim().min(1).optional(),
  policyId: z.string().trim().min(1).optional(),
  projectChecksDir: z.string().trim().min(1).optional(),
  repoPath: z.string().trim().min(1).optional(),
  outputFormat: z.enum(OUTPUT_VALUES).optional(),
  agent: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  emitBundlePath: z.string().trim().min(1).optional(),
  scanScope: z.enum(SCOPE_VALUES).optional(),
  scanTarget: z.string().trim().min(1).optional(),
  mockOpencode: z.boolean().optional(),
  configPath: z.string().trim().min(1).optional(),
  logPath: z.string().trim().min(1).optional(),
  runtimeMode: z.enum(RUNTIME_MODE_VALUES).optional(),
  image: z.string().trim().min(1).optional(),
  artifactsDir: z.string().trim().min(1).optional(),
  parallelism: parallelismSchema.optional(),
  ui: z.boolean().optional()
});

const scanOptionsSchema = z
  .object({
    checkId: z.string().trim().min(1).optional(),
    policyId: z.string().trim().min(1).optional(),
    projectChecksDir: z.string().trim().min(1).optional(),
    repoPath: z.string().trim().min(1).default('.'),
    outputFormat: z.enum(OUTPUT_VALUES).default(DEFAULT_OUTPUT),
    agent: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    emitBundlePath: z.string().trim().min(1).optional(),
    scanScope: z.enum(SCOPE_VALUES).default(DEFAULT_SCAN_SCOPE),
    scanTarget: z.string().trim().min(1).optional(),
    mockOpencode: z.boolean().default(false),
    configPath: z.string().trim().min(1).optional(),
    logPath: z.string().trim().min(1).optional(),
    runtimeMode: z.enum(RUNTIME_MODE_VALUES).default(DEFAULT_RUNTIME_MODE),
    image: z.string().trim().min(1).optional(),
    artifactsDir: z.string().trim().min(1).optional(),
    parallelism: parallelismSchema.default(DEFAULT_PARALLELISM),
    ui: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    if (value.projectChecksDir) {
      if (value.policyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Project-local checks are configured via `.openshrike/checks`; use plain `shrike scan` or `--check <CHECK_ID>`.'
        });
      }
    } else {
      const hasCheck = Boolean(value.checkId);
      const hasPolicy = Boolean(value.policyId);

      if (hasCheck === hasPolicy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.'
        });
      }
    }

    if (value.scanScope === 'commit' && !value.scanTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'."
      });
    }

    if (value.scanScope === 'branch' && !value.scanTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'."
      });
    }
  });

export function validateScanOptions(input: unknown): ScanCommandOptions {
  return scanOptionsSchema.parse(input);
}

export async function resolveScanOptions(input: unknown): Promise<ScanCommandOptions> {
  const rawOptions = rawScanOptionsSchema.parse(input);
  const repoPathForDiscovery = path.resolve(rawOptions.repoPath ?? '.');
  const loadedProjectConfig = await loadProjectConfigForRepo(repoPathForDiscovery);
  const merged = {
    ...await mapProjectConfigToScanOptions(loadedProjectConfig),
    ...rawOptions
  };

  if (!merged.repoPath) {
    merged.repoPath = loadedProjectConfig
      ? resolveProjectConfigRelativePath(loadedProjectConfig, loadedProjectConfig.config.scan.repo)
      : '.';
  }

  return validateScanOptions(merged);
}

function mapProjectConfigToScanOptions(
  loadedProjectConfig: Awaited<ReturnType<typeof loadProjectConfigForRepo>>
): Promise<Partial<ScanCommandOptions>> {
  return buildProjectConfigScanOptions(loadedProjectConfig);
}

async function buildProjectConfigScanOptions(
  loadedProjectConfig: Awaited<ReturnType<typeof loadProjectConfigForRepo>>
): Promise<Partial<ScanCommandOptions>> {
  if (!loadedProjectConfig) {
    return {};
  }

  const {config} = loadedProjectConfig;
  const projectChecksDir = await resolveConfiguredProjectChecksDirectory(loadedProjectConfig);
  return {
    ...(projectChecksDir
      ? {projectChecksDir}
      : config.scan.defaultKind === 'policy'
        ? {policyId: config.scan.defaultId}
        : config.scan.defaultKind === 'check'
          ? {checkId: config.scan.defaultId}
          : {}),
    repoPath: resolveProjectConfigRelativePath(loadedProjectConfig, config.scan.repo),
    outputFormat: config.scan.output,
    agent: config.runtime.agent,
    model: config.runtime.model,
    scanScope: config.scan.scope,
    configPath: resolveProjectConfigRelativePath(loadedProjectConfig, config.runtime.configPath),
    runtimeMode: config.runtime.mode,
    artifactsDir: resolveOptionalProjectConfigRelativePath(loadedProjectConfig, config.scan.artifactsDir),
    parallelism: config.runtime.parallelism,
    ui: config.scan.ui
  };
}

async function resolveConfiguredProjectChecksDirectory(
  loadedProjectConfig: NonNullable<Awaited<ReturnType<typeof loadProjectConfigForRepo>>>
): Promise<string | undefined> {
  if (loadedProjectConfig.config.scan.defaultKind === 'project-checks') {
    return resolveProjectConfigRelativePath(loadedProjectConfig, loadedProjectConfig.config.scan.defaultId);
  }

  const configuredPath = getProjectChecksDirectory(loadedProjectConfig.repoRoot);

  try {
    const stats = await fs.stat(configuredPath);
    return stats.isDirectory() ? configuredPath : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}
