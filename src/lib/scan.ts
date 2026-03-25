import fs from 'node:fs/promises';
import path from 'node:path';
import type {Event} from '@opencode-ai/sdk';
import {CliError} from './cli-error.js';
import {DEFAULT_AGENT_NAME, DEFAULT_MODEL, MAX_POLICY_CHECKS} from './constants.js';
import {loadRuntimeConfig} from './config.js';
import {evaluateCheck} from './evaluator.js';
import {resolvePolicyDefinition} from './policies.js';
import {RepoMutationGuard} from './repo-guard.js';
import {createScanLogger} from './scan-log.js';
import {OpenCodeRuntime} from './runtime.js';
import {resolveScanScope} from './scope.js';
import type {
  CheckResult,
  ScanCommandOptions,
  ScanProgressEvent,
  ScanProgressEventType,
  ScanReport
} from './types.js';

export interface ScanHooks {
  onProgress?: (event: ScanProgressEvent) => void;
  onRuntimeEvent?: (event: Event) => void;
}

export async function runScan(
  options: ScanCommandOptions,
  hooks: ScanHooks = {}
): Promise<ScanReport> {
  const logger = await createScanLogger(options.logPath);
  const repoFullPath = path.resolve(options.repoPath);
  try {
    logger?.write('scan.started', {
      repoPath: repoFullPath,
      policyId: options.policyId ?? null,
      checkId: options.checkId ?? null,
      scanScope: options.scanScope,
      scanTarget: options.scanTarget ?? null,
      outputFormat: options.outputFormat,
      agent: options.agent ?? null,
      model: options.model ?? null,
      mockOpencode: options.mockOpencode,
      configPath: options.configPath ?? null,
      ui: options.ui
    });

    const stats = await fs.stat(repoFullPath).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new Error(`Repository path not found: ${repoFullPath}`);
    }

    const policy = options.policyId ? await resolvePolicyDefinition(options.policyId) : null;
    const checkIds = policy ? policy.checkIds : [options.checkId!];
    if (checkIds.length > MAX_POLICY_CHECKS) {
      throw new CliError(
        'POLICY_TOO_LARGE',
        `Policy expands to ${checkIds.length} checks, which exceeds the maximum supported ${MAX_POLICY_CHECKS}.`
      );
    }
    const bundleId = policy?.id ?? options.checkId!;
    const policyVersion = policy?.version ?? new Date().toISOString().slice(0, 10);

    const scopeContext = await resolveScanScope(repoFullPath, options.scanScope, options.scanTarget);
    emitProgress(logger, hooks, 'scope-resolved', scopeContext, [], null, null, 0, checkIds.length);

    if (!scopeContext.isFullRepository && scopeContext.files.length === 0) {
      emitProgress(logger, hooks, 'no-changes-in-scope', scopeContext, [], null, null, 0, checkIds.length);
      const checks = checkIds.map(createNoChangesResult);
      const report = buildReport(bundleId, policyVersion, repoFullPath, checks);
      logger?.write('scan.completed', {
        summary: report.summary
      });
      return report;
    }

    const agentName = options.agent?.trim() || DEFAULT_AGENT_NAME;
    const model = options.model?.trim() || DEFAULT_MODEL;
    const runtimeConfig = options.mockOpencode
      ? null
      : await loadRuntimeConfig(options.configPath, {
          agent: agentName,
          model
        });

    logger?.write('runtime.config', runtimeConfig
      ? {
          configPath: runtimeConfig.configPath,
          missingEnvVars: runtimeConfig.missingEnvVars
        }
      : {
          mode: 'mock'
        });

    if (runtimeConfig && runtimeConfig.missingEnvVars.length > 0) {
      throw new Error(
        `Missing required environment variable(s) for ${runtimeConfig.configPath}: ${runtimeConfig.missingEnvVars.join(', ')}`
      );
    }

    const handleRuntimeEvent = (event: Event) => {
      logger?.write('opencode.event', summarizeRuntimeEvent(event));
      hooks.onRuntimeEvent?.(event);
    };

    const runtime = runtimeConfig
      ? await OpenCodeRuntime.create({
          repoPath: repoFullPath,
          config: runtimeConfig.config,
          onEvent: handleRuntimeEvent,
          logger
        })
      : null;

    const checks: CheckResult[] = [];
    const ignoredRepoPaths = resolveIgnoredRepoPaths(repoFullPath, logger?.path);

    try {
      for (const [index, checkId] of checkIds.entries()) {
        emitProgress(logger, hooks, 'check-started', scopeContext, checks, checkId, null, index + 1, checkIds.length);

        const guard = await RepoMutationGuard.capture(repoFullPath, {
          ignoredPaths: ignoredRepoPaths
        });
        const result = await evaluateCheck({
          checkId,
          repoPath: repoFullPath,
          agent: agentName,
          model,
          scopeContext,
          emulateOpencode: options.mockOpencode,
          runtime
        });
        await guard.throwIfMutated();
        checks.push(result);

        emitProgress(
          logger,
          hooks,
          'check-completed',
          scopeContext,
          checks,
          checkId,
          result.status,
          index + 1,
          checkIds.length
        );
      }
    } finally {
      await runtime?.close();
    }

    const report = buildReport(bundleId, policyVersion, repoFullPath, checks);
    logger?.write('scan.completed', {
      summary: report.summary
    });
    return report;
  } catch (error) {
    logger?.write('scan.failed', {
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await logger?.close();
  }
}

function emitProgress(
  logger: Awaited<ReturnType<typeof createScanLogger>>,
  hooks: ScanHooks,
  type: ScanProgressEventType,
  scopeContext: Awaited<ReturnType<typeof resolveScanScope>>,
  checks: CheckResult[],
  checkId: string | null,
  checkStatus: CheckResult['status'] | null,
  checkIndex: number,
  totalChecks: number
): void {
  const event = {
    type,
    scopeLabel: scopeContext.label,
    scopeFileCount: scopeContext.files.length,
    isFullRepository: scopeContext.isFullRepository,
    checkId,
    checkStatus,
    passedCount: checks.filter(check => check.status === 'pass').length,
    failedCount: checks.filter(check => check.status === 'fail').length,
    unknownCount: checks.filter(check => check.status === 'unknown').length,
    checkIndex,
    totalChecks
  } satisfies ScanProgressEvent;

  logger?.write('scan.progress', event);
  hooks.onProgress?.(event);
}

function buildReport(
  bundleId: string,
  policyVersion: string,
  repoPath: string,
  checks: CheckResult[]
): ScanReport {
  return {
    bundle_id: bundleId,
    policy_version: policyVersion,
    repo: {
      path: repoPath
    },
    summary: {
      total_checks: checks.length,
      passed: checks.filter(check => check.status === 'pass').length,
      failed: checks.filter(check => check.status === 'fail').length,
      unknown: checks.filter(check => check.status === 'unknown').length
    },
    checks
  };
}

function createNoChangesResult(checkId: string): CheckResult {
  return {
    id: checkId,
    version: '0.1.0',
    status: 'unknown',
    confidence: 'LOW',
    evidence: [],
    rationale: 'No files matched the selected scan scope.',
    remediation: [
      'Choose a scope that includes changed files.',
      "Use '--scan-scope full' to evaluate the full repository."
    ]
  };
}

function resolveIgnoredRepoPaths(repoPath: string, logPath?: string): string[] {
  if (!logPath) {
    return [];
  }

  const relativePath = path.relative(repoPath, logPath);
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return [];
  }

  return [relativePath.replaceAll(path.sep, '/')];
}

function summarizeRuntimeEvent(
  event: Event | {type: string; properties?: Record<string, unknown>}
): Record<string, unknown> {
  const runtimeEvent = event as {type: string; properties?: Record<string, unknown>};

  if (runtimeEvent.type === 'message.part.delta') {
    const properties = runtimeEvent.properties as
      | {
          sessionID?: string;
          messageID?: string;
          partID?: string;
          field?: string;
          delta?: string;
        }
      | undefined;
    return {
      type: runtimeEvent.type,
      sessionID: properties?.sessionID ?? null,
      messageID: properties?.messageID ?? null,
      partID: properties?.partID ?? null,
      field: properties?.field ?? null,
      deltaLength: properties?.delta?.length ?? 0
    };
  }

  switch (runtimeEvent.type) {
    case 'message.part.updated': {
      const properties = runtimeEvent.properties as
        | {
            part?: {
              type?: string;
              sessionID?: string;
              messageID?: string;
              text?: string;
            };
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        partType: properties?.part?.type ?? null,
        sessionID: properties?.part?.sessionID ?? null,
        messageID: properties?.part?.messageID ?? null,
        textLength: typeof properties?.part?.text === 'string' ? properties.part.text.length : undefined
      };
    }
    case 'message.updated': {
      const properties = runtimeEvent.properties as
        | {
            info?: {
              role?: string;
              sessionID?: string;
              id?: string;
            };
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        role: properties?.info?.role ?? null,
        sessionID: properties?.info?.sessionID ?? null,
        messageID: properties?.info?.id ?? null
      };
    }
    case 'session.status': {
      const properties = runtimeEvent.properties as
        | {
            sessionID?: string;
            status?: {
              type?: string;
            };
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        sessionID: properties?.sessionID ?? null,
        status: properties?.status?.type ?? null
      };
    }
    case 'session.error': {
      const properties = runtimeEvent.properties as
        | {
            sessionID?: string;
            error?: {
              data?: {
                message?: string;
              };
            };
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        sessionID: properties?.sessionID ?? null,
        message: properties?.error?.data?.message ?? 'unknown error'
      };
    }
    case 'permission.updated': {
      const properties = runtimeEvent.properties as
        | {
            sessionID?: string;
            id?: string;
            title?: string;
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        sessionID: properties?.sessionID ?? null,
        permissionID: properties?.id ?? null,
        title: properties?.title ?? null
      };
    }
    case 'permission.replied': {
      const properties = runtimeEvent.properties as
        | {
            sessionID?: string;
            permissionID?: string;
            response?: string;
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        sessionID: properties?.sessionID ?? null,
        permissionID: properties?.permissionID ?? null,
        response: properties?.response ?? null
      };
    }
    default:
      return {
        type: runtimeEvent.type
      };
  }
}
