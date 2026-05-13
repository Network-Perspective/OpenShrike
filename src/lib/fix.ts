import {loadRuntimeConfig} from './config.js';
import {DEFAULT_FIX_AGENT_NAME, DEFAULT_FIX_MODEL} from './constants.js';
import {runFixForCheck} from './fix-runtime.js';
import {sortChecksByStatus} from './report.js';
import {OpenCodeRuntime} from './runtime.js';
import {resolveScanScope} from './scope.js';
import {runScan} from './scan.js';
import type {
  CheckResult,
  SavedScanRequest,
  ScanCommandOptions,
  ScanReport
} from './types.js';

export function buildActionScanOptions(options: {
  base: ScanCommandOptions;
  request: SavedScanRequest;
  repoPath: string;
  checkId: string;
}): ScanCommandOptions {
  return {
    ...options.base,
    checkId: options.checkId,
    policyId: undefined,
    projectChecksDir: options.request.projectChecksDir ?? undefined,
    repoPath: options.repoPath,
    scanScope: options.request.scanScope,
    scanTarget: options.request.scanTarget ?? undefined,
    runtimeMode: options.request.runtimeMode,
    ui: false,
    lastScan: false
  };
}

export function updateReportCheck(report: ScanReport, nextCheck: CheckResult): ScanReport {
  const checks = sortChecksByStatus(
    report.checks.map(check => check.id === nextCheck.id ? nextCheck : check)
  );

  return {
    ...report,
    summary: {
      total_checks: checks.length,
      passed: checks.filter(check => check.status === 'pass').length,
      failed: checks.filter(check => check.status === 'fail').length,
      unknown: checks.filter(check => check.status === 'unknown').length
    },
    checks
  };
}

export async function recheckSingleCheck(options: {
  base: ScanCommandOptions;
  request: SavedScanRequest;
  repoPath: string;
  checkId: string;
}): Promise<CheckResult> {
  const report = await runScan(buildActionScanOptions({
    base: options.base,
    request: options.request,
    repoPath: options.repoPath,
    checkId: options.checkId
  }));
  const result = report.checks.find(check => check.id === options.checkId);
  if (!result) {
    throw new Error(`Recheck did not return a result for '${options.checkId}'.`);
  }

  return result;
}

export async function fixAndRecheckCheck(options: {
  base: ScanCommandOptions;
  request: SavedScanRequest;
  report: ScanReport;
  check: CheckResult;
}): Promise<CheckResult> {
  const repoPath = options.report.repo.path;
  if (options.request.runtimeMode !== 'native') {
    throw new Error('Fix is currently supported only in native runtime mode.');
  }

  const scopeContext = await resolveScanScope(
    repoPath,
    options.request.scanScope,
    options.request.scanTarget ?? undefined
  );
  const runtimeConfig = options.base.mockOpencode
    ? null
    : await loadRuntimeConfig(options.base.configPath, {
        agent: options.base.agent,
        model: options.base.model,
        fixAgent: options.base.fixAgent,
        fixModel: options.base.fixModel
      });
  const runtime = runtimeConfig
    ? await OpenCodeRuntime.create({
        repoPath,
        config: runtimeConfig.config
      })
    : null;

  try {
    await runFixForCheck({
      check: options.check,
      request: options.request,
      repoPath,
      projectChecksDir: options.request.projectChecksDir ?? undefined,
      agent: options.base.fixAgent ?? options.base.agent ?? DEFAULT_FIX_AGENT_NAME,
      model: options.base.fixModel ?? options.base.model ?? DEFAULT_FIX_MODEL,
      runtime,
      emulateOpencode: options.base.mockOpencode,
      scopeContext
    });
  } finally {
    await runtime?.close();
  }

  return await recheckSingleCheck({
    base: options.base,
    request: options.request,
    repoPath,
    checkId: options.check.id
  });
}
