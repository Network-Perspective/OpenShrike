import fs from 'node:fs/promises';
import path from 'node:path';
import type {Event} from '@opencode-ai/sdk';
import {DEFAULT_AGENT_NAME, DEFAULT_MODEL} from './constants.js';
import {loadRuntimeConfig} from './config.js';
import {evaluateCheck} from './evaluator.js';
import {resolvePolicyDefinition} from './policies.js';
import {RepoMutationGuard} from './repo-guard.js';
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
  const repoFullPath = path.resolve(options.repoPath);
  const stats = await fs.stat(repoFullPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Repository path not found: ${repoFullPath}`);
  }

  const policy = options.policyId ? await resolvePolicyDefinition(options.policyId) : null;
  const checkIds = policy ? policy.checkIds : [options.checkId!];
  const bundleId = policy?.id ?? options.checkId!;
  const policyVersion = policy?.version ?? new Date().toISOString().slice(0, 10);

  const scopeContext = await resolveScanScope(repoFullPath, options.scanScope, options.scanTarget);
  emitProgress(hooks, 'scope-resolved', scopeContext, [], null, null, 0, checkIds.length);

  if (!scopeContext.isFullRepository && scopeContext.files.length === 0) {
    emitProgress(hooks, 'no-changes-in-scope', scopeContext, [], null, null, 0, checkIds.length);
    const checks = checkIds.map(createNoChangesResult);
    return buildReport(bundleId, policyVersion, repoFullPath, checks);
  }

  const agentName = options.agent?.trim() || DEFAULT_AGENT_NAME;
  const model = options.model?.trim() || DEFAULT_MODEL;
  const runtimeConfig = options.mockOpencode
    ? null
    : await loadRuntimeConfig(options.configPath, {
        agent: agentName,
        model
      });

  if (runtimeConfig && runtimeConfig.missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for ${runtimeConfig.configPath}: ${runtimeConfig.missingEnvVars.join(', ')}`
    );
  }

  const runtime = runtimeConfig
    ? await OpenCodeRuntime.create({
        repoPath: repoFullPath,
        config: runtimeConfig.config,
        ...(hooks.onRuntimeEvent ? {onEvent: hooks.onRuntimeEvent} : {})
      })
    : null;

  try {
    const checks: CheckResult[] = [];

    for (const [index, checkId] of checkIds.entries()) {
      emitProgress(hooks, 'check-started', scopeContext, checks, checkId, null, index + 1, checkIds.length);

      const guard = await RepoMutationGuard.capture(repoFullPath);
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

    return buildReport(bundleId, policyVersion, repoFullPath, checks);
  } finally {
    await runtime?.close();
  }
}

function emitProgress(
  hooks: ScanHooks,
  type: ScanProgressEventType,
  scopeContext: Awaited<ReturnType<typeof resolveScanScope>>,
  checks: CheckResult[],
  checkId: string | null,
  checkStatus: CheckResult['status'] | null,
  checkIndex: number,
  totalChecks: number
): void {
  hooks.onProgress?.({
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
  });
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
