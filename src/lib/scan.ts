import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Event} from '@opencode-ai/sdk';
import {CliError} from './cli-error.js';
import {
  ARTIFACTS_DIRECTORY_NAME,
  CHECK_EVALUATION_MAX_ATTEMPTS,
  CONFIG_DIRECTORY_NAME,
  DEFAULT_AGENT_NAME,
  DEFAULT_DOCKER_IMAGE,
  DEFAULT_FIX_AGENT_NAME,
  DEFAULT_FIX_MODEL,
  DEFAULT_MODEL,
  DOCKER_RUNTIME_CONFIG_ENV,
  DOCKER_SCAN_LOG_FILE,
  DOCKER_SCAN_REPORT_FILE,
  DOCKER_SCAN_REQUEST_FILE,
  INCONCLUSIVE_OUTPUT_MAX_LENGTH,
  MAX_POLICY_CHECKS
} from './constants.js';
import {getDefaultConfigPath, loadRuntimeConfig, type LoadedRuntimeConfig} from './config.js';
import {
  parseScanReport,
  type DockerScanRequest,
  tryDecodeDockerWireMessage
} from './docker-protocol.js';
import {runFixForCheck} from './fix-runtime.js';
import {createSavedScanRequest} from './last-scan.js';
import {resolveProjectCheckSelection} from './checks.js';
import {CheckEvaluationError, evaluateCheck, getCheckEvaluationOriginalOutput} from './evaluator.js';
import {resolvePolicyDefinition} from './policies.js';
import {runProcess} from './process.js';
import {findToolRoot} from './project-root.js';
import {RepoMutationGuard} from './repo-guard.js';
import {sortChecksByStatus} from './report.js';
import {createScanLogger} from './scan-log.js';
import {type RuntimeEventEnvelope, OpenCodeRuntime} from './runtime.js';
import {resolveScanScope} from './scope.js';
import type {
  CheckResult,
  RuntimeMode,
  SavedScanRequest,
  SavedScanScope,
  ScanCommandOptions,
  ScanProgressEvent,
  ScanProgressEventType,
  ScanReport,
  ScanRuntimeEvent
} from './types.js';

interface NativeScanExecutionOptions {
  runtimeMode: RuntimeMode;
  runtimeConfigOverride?: LoadedRuntimeConfig | null | undefined;
  ignoredRepoPaths?: string[] | undefined;
}

interface ProgressState {
  resultsByCheckId: Map<string, CheckResult>;
  runningCheckIds: Set<string>;
  completedCount: number;
}

interface DockerBindMount {
  source: string;
  target: string;
  readonly: boolean;
}

interface GitRepositoryContext {
  worktreeRootHostPath: string;
  gitDirHostPath: string;
  gitCommonDirHostPath: string;
  gitDirReference: string | null;
  commonDirReference: string | null;
  usesLinkedGitDir: boolean;
}

const OPENCODE_PROVIDERS_DOCS_URL = 'https://opencode.ai/docs/providers/';
const OPENCODE_EXECUTION_LAYER_NOTE = 'OpenShrike uses OpenCode as its agent execution layer, so scans cannot run until OpenCode is configured correctly.';
const MAX_PROGRESS_DETAIL_LINES = 8;
const DOCKER_RUNTIME_CONTEXT_LABEL = 'io.openshrike.runtime-context-hash';
const DOCKER_RUNTIME_CONFIG_PATH_LABEL = 'docker-env';
const DOCKER_OPENCODE_HOME_DIRECTORY_NAME = 'opencode-home';

export interface ScanHooks {
  onProgress?: (event: ScanProgressEvent) => void;
  onRuntimeEvent?: (event: ScanRuntimeEvent) => void;
}

interface ScanSessionHooks {
  onUpdate?: (snapshot: ScanSessionSnapshot) => void;
  onRuntimeEvent?: (event: ScanRuntimeEvent) => void;
}

interface PendingReadJob {
  kind: 'scan' | 'recheck';
  checkId: string;
  resolve?: ((result: CheckResult) => void) | undefined;
  reject?: ((error: unknown) => void) | undefined;
}

interface ActiveReadJob {
  kind: PendingReadJob['kind'];
  workerId: string;
}

export interface ScanSessionSnapshot {
  request: SavedScanRequest;
  repoPath: string;
  bundleId: string | null;
  policyVersion: string | null;
  checkOrder: string[];
  resultsByCheckId: Record<string, CheckResult>;
  runningCheckIds: string[];
  fixingCheckId: string | null;
  scopeLabel: string;
  scopeFileCount: number;
  isFullRepository: boolean;
  completedCount: number;
  totalChecks: number;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  statusLabel: string;
  detailLines: string[];
  isPrepared: boolean;
  isScanComplete: boolean;
  report: ScanReport | null;
}

export interface NativeScanSession {
  getRequest(): SavedScanRequest;
  getScope(): SavedScanScope | null;
  getSnapshot(): ScanSessionSnapshot;
  getReport(): ScanReport | null;
  getPersistableReport(): ScanReport | null;
  start(): Promise<ScanReport>;
  waitForIdle(): Promise<ScanReport>;
  requestRecheck(checkId: string): Promise<CheckResult>;
  requestFix(checkId: string): Promise<CheckResult>;
  close(): Promise<void>;
}

export function createNativeScanSession(
  options: ScanCommandOptions,
  initialState?: {
    initialReport: ScanReport;
    savedRequest: SavedScanRequest;
    savedScope?: SavedScanScope | undefined;
  },
  hooks: ScanSessionHooks = {}
): NativeScanSession {
  const request = initialState?.savedRequest ?? createSavedScanRequest(options);
  const repoPath = path.resolve(initialState?.initialReport.repo.path ?? options.repoPath);
  const agentName = options.agent?.trim() || DEFAULT_AGENT_NAME;
  const model = options.model?.trim() || DEFAULT_MODEL;
  const fixAgent = options.fixAgent?.trim() || agentName || DEFAULT_FIX_AGENT_NAME;
  const fixModel = options.fixModel?.trim() || options.model?.trim() || DEFAULT_FIX_MODEL;
  const resultsByCheckId = new Map<string, CheckResult>(
    (initialState?.initialReport.checks ?? []).map(check => [check.id, check] as const)
  );
  const pendingReadJobs: PendingReadJob[] = [];
  const activeReadJobs = new Map<string, ActiveReadJob>();
  const idleWaiters: Array<{
    resolve: (report: ScanReport) => void;
    reject: (error: unknown) => void;
  }> = [];
  const drainWaiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];

  let bundleId = initialState?.initialReport.bundle_id ?? null;
  let policyVersion = initialState?.initialReport.policy_version ?? null;
  let checkOrder = initialState?.initialReport.checks.map(check => check.id) ?? [];
  let scopeContext: Awaited<ReturnType<typeof resolveScanScope>> | null = initialState
    ? (initialState.savedScope
        ? {
            kind: initialState.savedScope.kind,
            label: initialState.savedScope.label,
            files: [...initialState.savedScope.files],
            isFullRepository: initialState.savedScope.isFullRepository
          }
        : null)
    : null;
  let effectiveParallelism = initialState?.initialReport.execution?.effective_parallelism ?? 1;
  let requestedParallelism = initialState?.initialReport.execution?.requested_parallelism ?? options.parallelism;
  let artifactsDir = initialState?.initialReport.execution?.artifacts_dir ?? options.artifactsDir ?? null;
  let statusLabel = initialState ? 'Loaded saved last scan' : 'Preparing scan';
  let detailLines: string[] = [];
  let nextWorkerNumber = 1;
  let started = Boolean(initialState);
  let preparing = false;
  let preparePromise: Promise<void> | null = null;
  let isPrepared = Boolean(initialState);
  let isScanComplete = Boolean(initialState);
  let pumping = false;
  let pauseDispatch = false;
  let closed = false;
  let fatalError: unknown = null;
  let fixingCheckId: string | null = null;
  let logger: Awaited<ReturnType<typeof createScanLogger>> | null = null;
  let loggerPromise: Promise<Awaited<ReturnType<typeof createScanLogger>>> | null = null;
  let runtimeConfig: LoadedRuntimeConfig | null = null;
  let runtimeConfigPromise: Promise<LoadedRuntimeConfig | null> | null = null;
  let runtime: OpenCodeRuntime | null = null;
  let runtimePromise: Promise<OpenCodeRuntime | null> | null = null;
  let startPromise: Promise<ScanReport> | null = null;
  let remainingInitialCheckIds = new Set(checkOrder.filter(checkId => !resultsByCheckId.has(checkId)));

  if (initialState) {
    statusLabel = 'Scan complete';
  }

  emitUpdate();

  return {
    getRequest: () => request,
    getScope: () => scopeContext ? serializeSavedScope(scopeContext) : null,
    getSnapshot,
    getReport,
    getPersistableReport,
    async start(): Promise<ScanReport> {
      if (!startPromise) {
        startPromise = (async () => {
          await prepareFreshScan();
          return await waitForIdle();
        })();
      }

      return await startPromise;
    },
    async waitForIdle(): Promise<ScanReport> {
      return await waitForIdle();
    },
    async requestRecheck(checkId: string): Promise<CheckResult> {
      await prepareFreshScan();
      return await enqueueRecheck(checkId);
    },
    async requestFix(checkId: string): Promise<CheckResult> {
      await prepareFreshScan();
      return await runExclusiveFix(checkId);
    },
    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      const error = new Error('Scan session closed.');
      rejectPendingJobs(error);
      rejectIdleWaiters(error);
      rejectDrainWaiters(error);
      await runtime?.close().catch(() => undefined);
      await logger?.close().catch(() => undefined);
    }
  };

  function getSnapshot(): ScanSessionSnapshot {
    const report = getReport();
    return {
      request,
      repoPath,
      bundleId,
      policyVersion,
      checkOrder: [...checkOrder],
      resultsByCheckId: Object.fromEntries(resultsByCheckId.entries()),
      runningCheckIds: [...activeReadJobs.keys()],
      fixingCheckId,
      scopeLabel: scopeContext?.label ?? 'Resolving scope',
      scopeFileCount: scopeContext?.files.length ?? 0,
      isFullRepository: scopeContext?.isFullRepository ?? false,
      completedCount: checkOrder.filter(checkId => resultsByCheckId.has(checkId)).length,
      totalChecks: checkOrder.length,
      passedCount: countChecks(resultsByCheckId, 'pass'),
      failedCount: countChecks(resultsByCheckId, 'fail'),
      unknownCount: countChecks(resultsByCheckId, 'unknown'),
      statusLabel,
      detailLines: [...detailLines],
      isPrepared,
      isScanComplete,
      report
    };
  }

  function getReport(): ScanReport | null {
    if (!bundleId || !policyVersion || checkOrder.length === 0) {
      return initialState?.initialReport ?? null;
    }

    const checks = checkOrder
      .map(checkId => resultsByCheckId.get(checkId) ?? null)
      .filter((check): check is CheckResult => check !== null);
    if (checks.length !== checkOrder.length) {
      return null;
    }

    return buildReport({
      bundleId,
      policyVersion,
      repoPath,
      checks,
      runtimeMode: 'native',
      requestedParallelism,
      effectiveParallelism,
      artifactsDir
    });
  }

  function getPersistableReport(): ScanReport | null {
    if (!bundleId || !policyVersion || checkOrder.length === 0) {
      return initialState?.initialReport ?? null;
    }

    const checks = checkOrder.map(checkId =>
      resultsByCheckId.get(checkId)
      ?? createPendingSavedResult(checkId, activeReadJobs.has(checkId) || pendingReadJobs.some(job => job.checkId === checkId))
    );

    return buildReport({
      bundleId,
      policyVersion,
      repoPath,
      checks,
      runtimeMode: 'native',
      requestedParallelism,
      effectiveParallelism,
      artifactsDir
    });
  }

  function serializeSavedScope(scope: Awaited<ReturnType<typeof resolveScanScope>>): SavedScanScope {
    return {
      kind: scope.kind,
      label: scope.label,
      files: [...scope.files],
      isFullRepository: scope.isFullRepository
    };
  }

  async function prepareFreshScan(): Promise<void> {
    if (closed) {
      throw new Error('Scan session closed.');
    }

    if (fatalError) {
      throw fatalError;
    }

    if (isPrepared || preparing) {
      if (preparePromise) {
        await preparePromise;
      }

      return;
    }

    preparePromise = (async () => {
      started = true;
      preparing = true;
      logger = await ensureLogger();
      logger?.write('scan.started', {
        repoPath,
        policyId: options.policyId ?? null,
        checkId: options.checkId ?? null,
        projectChecksDir: options.projectChecksDir ?? null,
        scanScope: options.scanScope,
        scanTarget: options.scanTarget ?? null,
        outputFormat: options.outputFormat,
        agent: options.agent ?? null,
        model: options.model ?? null,
        mockOpencode: options.mockOpencode,
        configPath: options.configPath ?? null,
        runtimeMode: 'native',
        image: options.image ?? null,
        artifactsDir: options.artifactsDir ?? null,
        parallelism: options.parallelism,
        ui: options.ui
      });

      const stats = await fs.stat(repoPath).catch(() => null);
      if (!stats?.isDirectory()) {
        throw new Error(`Repository path not found: ${repoPath}`);
      }

      const selection = await resolveScanCheckSelection(options);
      checkOrder = selection.checkIds;
      bundleId = selection.bundleId;
      policyVersion = selection.version;
      remainingInitialCheckIds = new Set(checkOrder.filter(checkId => !resultsByCheckId.has(checkId)));
      effectiveParallelism = resolveEffectiveParallelism(options.parallelism, checkOrder.length);
      requestedParallelism = options.parallelism;
      artifactsDir = options.artifactsDir ?? null;
      scopeContext = await resolveScanScope(repoPath, request.scanScope, request.scanTarget ?? undefined);
      statusLabel = 'Scope resolved';
      detailLines = [];
      isPrepared = true;
      emitUpdate();

      if (!scopeContext.isFullRepository && scopeContext.files.length === 0) {
        for (const checkId of checkOrder) {
          resultsByCheckId.set(checkId, createNoChangesResult(checkId));
        }
        remainingInitialCheckIds.clear();
        isScanComplete = true;
        statusLabel = 'Scan complete';
        logger?.write('scan.completed', {
          summary: getReport()?.summary ?? null
        });
        emitUpdate();
        resolveDrainWaiters();
        resolveIdleWaitersIfReady();
        return;
      }

      pendingReadJobs.push(...checkOrder
        .filter(checkId => !resultsByCheckId.has(checkId))
        .map(checkId => ({kind: 'scan' as const, checkId})));
      pumpReadJobs();
    })().catch(error => {
      failSession(error);
      throw error;
    }).finally(() => {
      preparing = false;
      preparePromise = null;
    });

    await preparePromise;
  }

  async function enqueueRecheck(checkId: string): Promise<CheckResult> {
    const existing = resultsByCheckId.get(checkId);
    if (!existing) {
      throw new Error('Recheck is only available for completed checks.');
    }

    if (fixingCheckId === checkId) {
      throw new Error('This check is already being fixed.');
    }

    if (activeReadJobs.has(checkId) || pendingReadJobs.some(job => job.checkId === checkId)) {
      throw new Error('This check is already being rechecked.');
    }

    return await new Promise<CheckResult>((resolve, reject) => {
      pendingReadJobs.unshift({
        kind: 'recheck',
        checkId,
        resolve,
        reject
      });
      pumpReadJobs();
    });
  }

  async function runExclusiveFix(checkId: string): Promise<CheckResult> {
    const existing = resultsByCheckId.get(checkId);
    if (!existing || existing.status !== 'fail') {
      throw new Error('Fix is only available for failed checks.');
    }

    if (request.runtimeMode !== 'native') {
      throw new Error('Fix is currently supported only in native runtime mode.');
    }

    if (fixingCheckId === checkId) {
      throw new Error('This check is already being fixed.');
    }

    if (fixingCheckId) {
      throw new Error('Another action is already running.');
    }

    if (activeReadJobs.has(checkId)) {
      throw new Error('This check is already being rechecked.');
    }

    if (pendingReadJobs.some(job => job.checkId === checkId)) {
      throw new Error('This check is already being rechecked.');
    }

    pauseDispatch = true;
    fixingCheckId = checkId;
    statusLabel = `Fixing ${checkId}`;
    detailLines = [];
    emitUpdate();

    try {
      await waitForReadDrain();
      const runtimeInstance = await ensureRuntime();
      await runFixForCheck({
        check: existing,
        request,
        repoPath,
        projectChecksDir: request.projectChecksDir ?? undefined,
        agent: fixAgent,
        model: fixModel,
        runtime: runtimeInstance,
        emulateOpencode: options.mockOpencode,
        scopeContext: await ensureScopeContext()
      });
      const workerId = `fix-worker-${nextWorkerNumber++}`;
      fixingCheckId = null;
      activeReadJobs.set(checkId, {
        kind: 'recheck',
        workerId
      });
      statusLabel = `Rechecking ${checkId}`;
      emitUpdate();
      return await runReadCheck({
        kind: 'recheck',
        checkId
      }, workerId);
    } catch (error) {
      fixingCheckId = null;
      emitUpdate();
      if (!isRecoverableCheckError(error)) {
        failSession(error);
      }
      throw error;
    } finally {
      pauseDispatch = false;
      pumpReadJobs();
      resolveIdleWaitersIfReady();
    }
  }

  function pumpReadJobs(): void {
    if (pumping || closed || fatalError || !isPrepared || pauseDispatch) {
      return;
    }

    pumping = true;
    try {
      while (activeReadJobs.size < effectiveParallelism) {
        const nextIndex = pendingReadJobs.findIndex(job =>
          !activeReadJobs.has(job.checkId) && fixingCheckId !== job.checkId
        );
        if (nextIndex < 0) {
          break;
        }

        const [job] = pendingReadJobs.splice(nextIndex, 1);
        if (!job) {
          break;
        }

        const workerId = `worker-${nextWorkerNumber++}`;
        activeReadJobs.set(job.checkId, {
          kind: job.kind,
          workerId
        });
        statusLabel = job.kind === 'recheck'
          ? `Rechecking ${job.checkId}`
          : `Running ${job.checkId}`;
        detailLines = [];
        emitUpdate();
        void runReadCheck(job, workerId).then(
          result => {
            job.resolve?.(result);
          },
          error => {
            job.reject?.(error);
          }
        );
      }
    } finally {
      pumping = false;
      resolveIdleWaitersIfReady();
    }
  }

  async function runReadCheck(job: PendingReadJob, workerId: string): Promise<CheckResult> {
    try {
      const runtimeInstance = await ensureRuntime();
      const result = await evaluateCheckWithRecovery({
        checkId: job.checkId,
        workerId,
        repoPath,
        agent: agentName,
        model,
        runtimeConfigPath: runtimeConfig?.configPath,
        projectChecksDir: request.projectChecksDir ?? undefined,
        scopeContext: await ensureScopeContext(),
        emulateOpencode: options.mockOpencode,
        runtime: runtimeInstance,
        ignoredRepoPaths: dedupeIgnoredRepoPaths([
          ...resolveIgnoredRepoPaths(repoPath, logger?.path, options.artifactsDir),
          ...(options.artifactsDir ? [options.artifactsDir] : [])
        ]),
        logger
      });
      resultsByCheckId.set(job.checkId, result);
      if (job.kind === 'scan') {
        remainingInitialCheckIds.delete(job.checkId);
      }
      if (remainingInitialCheckIds.size === 0 && !pendingReadJobs.some(candidate => candidate.kind === 'scan')) {
        isScanComplete = true;
      }
      statusLabel = isScanComplete && activeReadJobs.size <= 1 && !fixingCheckId
        ? 'Scan complete'
        : `Completed ${job.checkId} (${result.status})`;
      detailLines = [];
      emitUpdate();
      if (isScanComplete && !fixingCheckId) {
        logger?.write('scan.completed', {
          summary: getReport()?.summary ?? null
        });
      }
      return result;
    } catch (error) {
      if (!isRecoverableCheckError(error)) {
        failSession(error);
      }
      throw error;
    } finally {
      activeReadJobs.delete(job.checkId);
      emitUpdate();
      resolveDrainWaiters();
      if (!pauseDispatch) {
        pumpReadJobs();
      }
      resolveIdleWaitersIfReady();
    }
  }

  async function ensureScopeContext(): Promise<Awaited<ReturnType<typeof resolveScanScope>>> {
    if (scopeContext) {
      return scopeContext;
    }

    scopeContext = await resolveScanScope(repoPath, request.scanScope, request.scanTarget ?? undefined);
    return scopeContext;
  }

  async function ensureRuntime(): Promise<OpenCodeRuntime | null> {
    if (options.mockOpencode) {
      return null;
    }

    if (runtime) {
      return runtime;
    }

    if (!runtimePromise) {
      runtimePromise = (async () => {
        runtimeConfig = await ensureRuntimeConfig();
        runtime = runtimeConfig
          ? await OpenCodeRuntime.create({
              repoPath,
              config: runtimeConfig.config,
              onEvent: handleRuntimeEvent,
              logger
            }).catch(error => {
              throw createOpenCodeRuntimeCliError(error, {
                stage: 'start',
                model,
                configPath: runtimeConfig?.configPath
              });
            })
          : null;
        return runtime;
      })();
    }

    return await runtimePromise;
  }

  async function ensureRuntimeConfig(): Promise<LoadedRuntimeConfig | null> {
    if (options.mockOpencode) {
      return null;
    }

    if (!runtimeConfigPromise) {
      runtimeConfigPromise = loadRuntimeConfig(options.configPath, {
        agent: agentName,
        model,
        fixAgent: options.fixAgent,
        fixModel: options.fixModel
      }).catch(error => {
        throw createRuntimeConfigCliError(error, {
          configPath: options.configPath,
          repoPath,
          model
        });
      });
    }

    const loaded = await runtimeConfigPromise;
    logger?.write('runtime.config', loaded
      ? {
          configPath: loaded.configPath,
          missingEnvVars: loaded.missingEnvVars
        }
      : {
          mode: 'mock'
        });
    if (loaded && loaded.missingEnvVars.length > 0) {
      throw createMissingEnvironmentCliError(loaded, model);
    }

    return loaded;
  }

  async function ensureLogger(): Promise<Awaited<ReturnType<typeof createScanLogger>>> {
    if (logger) {
      return logger;
    }

    if (!loggerPromise) {
      loggerPromise = createScanLogger(options.logPath);
    }

    logger = await loggerPromise;
    return logger;
  }

  function handleRuntimeEvent(runtimeEvent: RuntimeEventEnvelope): void {
    logger?.write('opencode.event', {
      ...summarizeRuntimeEvent(runtimeEvent.event),
      checkId: runtimeEvent.checkId,
      workerId: runtimeEvent.workerId,
      runtimeMode: 'native'
    });
    hooks.onRuntimeEvent?.({
      checkId: runtimeEvent.checkId,
      workerId: runtimeEvent.workerId,
      runtimeMode: 'native',
      event: runtimeEvent.event
    });
  }

  async function waitForReadDrain(): Promise<void> {
    if (activeReadJobs.size === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      drainWaiters.push({resolve, reject});
    });
  }

  async function waitForIdle(): Promise<ScanReport> {
    if (fatalError) {
      throw fatalError;
    }

    const report = getReport();
    if (report && activeReadJobs.size === 0 && pendingReadJobs.length === 0 && !fixingCheckId && !preparing) {
      return report;
    }

    return await new Promise<ScanReport>((resolve, reject) => {
      idleWaiters.push({resolve, reject});
      resolveIdleWaitersIfReady();
    });
  }

  function resolveIdleWaitersIfReady(): void {
    if (fatalError) {
      rejectIdleWaiters(fatalError);
      return;
    }

    const report = getReport();
    if (!report || activeReadJobs.size > 0 || pendingReadJobs.length > 0 || fixingCheckId || preparing) {
      return;
    }

    while (idleWaiters.length > 0) {
      idleWaiters.shift()?.resolve(report);
    }
  }

  function resolveDrainWaiters(): void {
    if (activeReadJobs.size > 0) {
      return;
    }

    while (drainWaiters.length > 0) {
      drainWaiters.shift()?.resolve();
    }
  }

  function rejectIdleWaiters(error: unknown): void {
    while (idleWaiters.length > 0) {
      idleWaiters.shift()?.reject(error);
    }
  }

  function rejectDrainWaiters(error: unknown): void {
    while (drainWaiters.length > 0) {
      drainWaiters.shift()?.reject(error);
    }
  }

  function rejectPendingJobs(error: unknown): void {
    while (pendingReadJobs.length > 0) {
      pendingReadJobs.shift()?.reject?.(error);
    }
  }

  function failSession(error: unknown): void {
    if (fatalError) {
      return;
    }

    fatalError = error;
    rejectPendingJobs(error);
    rejectIdleWaiters(error);
    rejectDrainWaiters(error);
  }

  function emitUpdate(): void {
    hooks.onUpdate?.(getSnapshot());
  }
}

export async function runScan(
  options: ScanCommandOptions,
  hooks: ScanHooks = {}
): Promise<ScanReport> {
  if (options.runtimeMode === 'docker') {
    return await runDockerScan(options, hooks);
  }

  return await runNativeScan(options, hooks, {
    runtimeMode: 'native'
  });
}

export async function runNativeScan(
  options: ScanCommandOptions,
  hooks: ScanHooks = {},
  executionOptions: NativeScanExecutionOptions = {
    runtimeMode: 'native'
  }
): Promise<ScanReport> {
  const logger = await createScanLogger(options.logPath);
  const repoFullPath = path.resolve(options.repoPath);

  try {
    logger?.write('scan.started', {
      repoPath: repoFullPath,
      policyId: options.policyId ?? null,
      checkId: options.checkId ?? null,
      projectChecksDir: options.projectChecksDir ?? null,
      scanScope: options.scanScope,
      scanTarget: options.scanTarget ?? null,
      outputFormat: options.outputFormat,
      agent: options.agent ?? null,
      model: options.model ?? null,
      mockOpencode: options.mockOpencode,
      configPath: options.configPath ?? null,
      runtimeMode: executionOptions.runtimeMode,
      image: options.image ?? null,
      artifactsDir: options.artifactsDir ?? null,
      parallelism: options.parallelism,
      ui: options.ui
    });

    const stats = await fs.stat(repoFullPath).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new Error(`Repository path not found: ${repoFullPath}`);
    }

    const checkSelection = await resolveScanCheckSelection(options);
    const checkIds = checkSelection.checkIds;
    if (checkIds.length > MAX_POLICY_CHECKS) {
      throw new CliError(
        'POLICY_TOO_LARGE',
        `Check selection expands to ${checkIds.length} checks, which exceeds the maximum supported ${MAX_POLICY_CHECKS}.`
      );
    }

    const bundleId = checkSelection.bundleId;
    const policyVersion = checkSelection.version;
    const scopeContext = await resolveScanScope(repoFullPath, options.scanScope, options.scanTarget);
    const progressState: ProgressState = {
      resultsByCheckId: new Map<string, CheckResult>(),
      runningCheckIds: new Set<string>(),
      completedCount: 0
    };

    emitProgress(
      logger,
      hooks,
      'scope-resolved',
      scopeContext,
      progressState,
      checkIds,
      null,
      null,
      null,
      null
    );

    const effectiveParallelism = resolveEffectiveParallelism(options.parallelism, checkIds.length);

    if (!scopeContext.isFullRepository && scopeContext.files.length === 0) {
      emitProgress(logger, hooks, 'no-changes-in-scope', scopeContext, progressState, checkIds, null, null, null, null);
      const checks = checkIds.map(createNoChangesResult);
      const report = buildReport({
        bundleId,
        policyVersion,
        repoPath: repoFullPath,
        checks,
        runtimeMode: executionOptions.runtimeMode,
        requestedParallelism: options.parallelism,
        effectiveParallelism,
        artifactsDir: options.artifactsDir ?? null
      });
      logger?.write('scan.completed', {
        summary: report.summary
      });
      return report;
    }

    const agentName = options.agent?.trim() || DEFAULT_AGENT_NAME;
    const model = options.model?.trim() || DEFAULT_MODEL;
    const runtimeConfig = options.mockOpencode
      ? null
      : executionOptions.runtimeConfigOverride ?? await loadRuntimeConfig(options.configPath, {
          agent: agentName,
          model,
          fixAgent: options.fixAgent,
          fixModel: options.fixModel
        }).catch(error => {
          throw createRuntimeConfigCliError(error, {
            configPath: options.configPath,
            repoPath: repoFullPath,
            model
          });
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
      throw createMissingEnvironmentCliError(runtimeConfig, model);
    }

    const handleRuntimeEvent = (runtimeEvent: RuntimeEventEnvelope) => {
      logger?.write('opencode.event', {
        ...summarizeRuntimeEvent(runtimeEvent.event),
        checkId: runtimeEvent.checkId,
        workerId: runtimeEvent.workerId,
        runtimeMode: executionOptions.runtimeMode
      });
      hooks.onRuntimeEvent?.({
        checkId: runtimeEvent.checkId,
        workerId: runtimeEvent.workerId,
        runtimeMode: executionOptions.runtimeMode,
        event: runtimeEvent.event
      });
    };

    const runtime = runtimeConfig
      ? await OpenCodeRuntime.create({
          repoPath: repoFullPath,
          config: runtimeConfig.config,
          onEvent: handleRuntimeEvent,
          logger
        }).catch(error => {
          throw createOpenCodeRuntimeCliError(error, {
            stage: 'start',
            model,
            configPath: runtimeConfig.configPath
          });
        })
      : null;

    const ignoredRepoPaths = dedupeIgnoredRepoPaths([
      ...resolveIgnoredRepoPaths(repoFullPath, logger?.path, options.artifactsDir),
      ...(executionOptions.ignoredRepoPaths ?? [])
    ]);

    try {
      await runChecks({
        checkIds,
        parallelism: effectiveParallelism,
        worker: async ({checkId, workerId}) => {
          progressState.runningCheckIds.add(checkId);
          emitProgress(
            logger,
            hooks,
            'check-started',
            scopeContext,
            progressState,
            checkIds,
            checkId,
            workerId,
            null,
            null
          );

          const result = await evaluateCheckWithRecovery({
            checkId,
            workerId,
            repoPath: repoFullPath,
            agent: agentName,
            model,
            runtimeConfigPath: runtimeConfig?.configPath,
            projectChecksDir: options.projectChecksDir,
            scopeContext,
            emulateOpencode: options.mockOpencode,
            runtime,
            ignoredRepoPaths,
            logger
          });

          progressState.resultsByCheckId.set(checkId, result);
          progressState.runningCheckIds.delete(checkId);
          progressState.completedCount += 1;

          emitProgress(
            logger,
            hooks,
            'check-completed',
            scopeContext,
            progressState,
            checkIds,
            checkId,
            workerId,
            result.status,
            result
          );
        }
      });
    } finally {
      await runtime?.close();
    }

    const checks = checkIds.map(checkId => {
      const result = progressState.resultsByCheckId.get(checkId);
      if (!result) {
        throw new Error(`Missing result for check '${checkId}'.`);
      }

      return result;
    });

    const report = buildReport({
      bundleId,
      policyVersion,
      repoPath: repoFullPath,
      checks,
      runtimeMode: executionOptions.runtimeMode,
      requestedParallelism: options.parallelism,
      effectiveParallelism,
      artifactsDir: options.artifactsDir ?? null
    });
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

async function runDockerScan(
  options: ScanCommandOptions,
  hooks: ScanHooks
): Promise<ScanReport> {
  const repoFullPath = path.resolve(options.repoPath);
  const repoStats = await fs.stat(repoFullPath).catch(() => null);
  if (!repoStats?.isDirectory()) {
    throw new Error(`Repository path not found: ${repoFullPath}`);
  }

  const agentName = options.agent?.trim() || DEFAULT_AGENT_NAME;
  const model = options.model?.trim() || DEFAULT_MODEL;
  const runtimeConfig = options.mockOpencode
    ? null
    : await loadRuntimeConfig(options.configPath, {
        agent: agentName,
        model,
        fixAgent: options.fixAgent,
        fixModel: options.fixModel
      }).catch(error => {
        throw createRuntimeConfigCliError(error, {
          configPath: options.configPath,
          repoPath: repoFullPath,
          model
        });
      });

  if (runtimeConfig && runtimeConfig.missingEnvVars.length > 0) {
    throw createMissingEnvironmentCliError(runtimeConfig, model);
  }

  const progressTracker = createRuntimePreparationTracker(hooks);
  const imageRef = options.image?.trim() || DEFAULT_DOCKER_IMAGE;
  if (!options.image) {
    await ensureDockerRuntimeImage(imageRef, progressTracker);
  }

  const artifactsDir = await resolveDockerArtifactsDirectory(options);
  const requestHostPath = path.join(artifactsDir, DOCKER_SCAN_REQUEST_FILE);
  const reportHostPath = path.join(artifactsDir, DOCKER_SCAN_REPORT_FILE);
  const logHostPath = path.join(artifactsDir, path.basename(options.logPath ?? DOCKER_SCAN_LOG_FILE));
  const projectChecksHostPath = options.projectChecksDir ? path.resolve(options.projectChecksDir) : null;
  const mountPlan = await resolveDockerRuntimeMountPlan(repoFullPath, projectChecksHostPath);
  const ignoredRepoPaths = resolveDockerRepoVisibleIgnoredPaths({
    repoContainerPath: mountPlan.repoContainerPath,
    workspaceHostPath: mountPlan.workspaceHostPath,
    hostPaths: [artifactsDir]
  });
  const opencodeHostAccess = await resolveDockerOpenCodeHostAccess({
    artifactsDir,
    runtimeConfig
  });
  const request: DockerScanRequest = {
    options: {
      ...options,
      repoPath: mountPlan.repoContainerPath,
      ...(mountPlan.projectChecksContainerPath
        ? {projectChecksDir: mountPlan.projectChecksContainerPath}
        : {}),
      runtimeMode: 'docker',
      logPath: '/io/' + path.basename(logHostPath),
      artifactsDir: '/io',
      ui: false
    },
    reportPath: '/io/' + path.basename(reportHostPath),
    ignoredRepoPaths
  };

  await fs.writeFile(requestHostPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');

  const dockerArgs = [
    'run',
    '--rm',
    '--mount', `type=bind,src=${mountPlan.workspaceHostPath},dst=/workspace/repo,readonly`,
    '--mount', `type=bind,src=${artifactsDir},dst=/io`,
    '--workdir', '/workspace/tool'
  ];
  mountPlan.extraMounts.forEach(mount => {
    dockerArgs.push('--mount', formatDockerBindMount(mount));
  });
  opencodeHostAccess.mounts.forEach(mount => {
    dockerArgs.push('--mount', formatDockerBindMount(mount));
  });
  applyDockerUserIdentity(dockerArgs);

  const dockerEnv: NodeJS.ProcessEnv = {
    ...process.env
  };
  const containerEnvVars = dedupeEnvVarNames([
    ...applyDockerHostEnvironment(dockerEnv, opencodeHostAccess.env),
    ...opencodeHostAccess.passThroughEnvVarNames
  ]);
  containerEnvVars.push(...applyGitSafeDirectoryEnv(dockerEnv, mountPlan.safeDirectories));
  if (runtimeConfig) {
    dockerEnv[DOCKER_RUNTIME_CONFIG_ENV] = Buffer.from(
      JSON.stringify(runtimeConfig.config),
      'utf8'
    ).toString('base64');
    containerEnvVars.push(DOCKER_RUNTIME_CONFIG_ENV);
  }
  containerEnvVars.forEach(name => {
    dockerArgs.push('-e', name);
  });
  dockerArgs.push(
    imageRef,
    'node',
    'dist/cli.js',
    'internal',
    'scan-worker',
    '--request',
    '/io/' + path.basename(requestHostPath)
  );

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let workerReady = false;

  progressTracker.setStatus(`Starting Docker worker (${imageRef})`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      cwd: findToolRoot(),
      env: dockerEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const handleStdoutLine = (line: string) => {
      if (!line) {
        return;
      }

      const wireMessage = tryDecodeDockerWireMessage(line);
      if (!wireMessage) {
        stdoutLines.push(line);
        if (!workerReady) {
          progressTracker.pushLine(line);
        }
        return;
      }

      workerReady = true;
      if (wireMessage.kind === 'progress') {
        hooks.onProgress?.(wireMessage.event);
        return;
      }

      hooks.onRuntimeEvent?.(wireMessage.event);
    };

    const stdoutBuffer = createLineBuffer(handleStdoutLine);
    const stderrBuffer = createLineBuffer(line => {
      stderrLines.push(line);
      if (!workerReady) {
        progressTracker.pushLine(line);
      }
    });

    child.stdout.on('data', chunk => {
      stdoutBuffer.push(chunk);
    });

    child.stderr.on('data', chunk => {
      stderrBuffer.push(chunk);
    });

    child.on('error', reject);
    child.on('close', code => {
      stdoutBuffer.flush();
      stderrBuffer.flush();

      if (code === 0 || code === 2) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `Docker scan worker exited with code ${code}.`,
            stderrLines.join('\n').trim(),
            stdoutLines.join('\n').trim()
          ].filter(Boolean).join('\n')
        )
      );
    });
  });

  const reportRaw = await fs.readFile(reportHostPath, 'utf8').catch(() => null);
  if (!reportRaw) {
    throw new Error(
      `Docker scan completed without producing ${path.basename(reportHostPath)}.`
    );
  }

  const report = parseScanReport(reportRaw);
  return {
    ...report,
    repo: {
      path: repoFullPath
    },
    execution: report.execution
      ? {
          ...report.execution,
          runtime_mode: 'docker',
          artifacts_dir: artifactsDir
        }
      : {
          runtime_mode: 'docker',
          requested_parallelism: options.parallelism,
          effective_parallelism: resolveEffectiveParallelism(
            options.parallelism,
            report.summary.total_checks
          ),
          artifacts_dir: artifactsDir
        }
  };
}

async function ensureDockerRuntimeImage(
  imageRef: string,
  progressTracker: ReturnType<typeof createRuntimePreparationTracker>
): Promise<void> {
  const toolRoot = findToolRoot();
  const dockerfilePath = path.join(toolRoot, 'docker', 'openshrike-runtime.Dockerfile');
  const runtimeContextHash = await computeDockerRuntimeContextHash(toolRoot);

  progressTracker.setStatus(`Checking Docker runtime image (${imageRef})`);
  try {
    const {stdout} = await runProcess('docker', [
      'image',
      'inspect',
      '--format',
      `{{ index .Config.Labels "${DOCKER_RUNTIME_CONTEXT_LABEL}" }}`,
      imageRef
    ], {
      cwd: toolRoot,
      env: process.env
    });

    if (stdout.trim() === runtimeContextHash) {
      return;
    }
  } catch {
    // Missing image falls through to rebuild.
  }

  await fs.access(dockerfilePath);
  progressTracker.setStatus(`Preparing Docker image (${imageRef})`);
  await runStreamingProcess('docker', [
    'build',
    '--label',
    `${DOCKER_RUNTIME_CONTEXT_LABEL}=${runtimeContextHash}`,
    '-t',
    imageRef,
    '-f',
    dockerfilePath,
    '.'
  ], {
    cwd: toolRoot,
    env: process.env,
    onStdoutLine: line => {
      progressTracker.pushLine(line);
    },
    onStderrLine: line => {
      progressTracker.pushLine(line);
    }
  });
}

export async function resolveDockerArtifactsDirectory(options: ScanCommandOptions): Promise<string> {
  if (options.artifactsDir) {
    const resolved = path.resolve(options.artifactsDir);
    await fs.mkdir(resolved, {recursive: true});
    return resolved;
  }

  if (options.logPath) {
    const resolved = path.resolve(path.dirname(options.logPath));
    await fs.mkdir(resolved, {recursive: true});
    return resolved;
  }

  const repoRoot = path.resolve(options.repoPath);
  const baseDirectory = path.join(repoRoot, CONFIG_DIRECTORY_NAME, ARTIFACTS_DIRECTORY_NAME);
  await fs.mkdir(baseDirectory, {recursive: true});
  return await fs.mkdtemp(path.join(baseDirectory, 'docker-'));
}

function createRuntimePreparationTracker(hooks: ScanHooks) {
  let statusLabel = 'Preparing Docker runtime';
  const detailLines: string[] = [];
  let lastSnapshot = '';

  const emit = () => {
    const event = {
      type: 'runtime-status' as const,
      scopeLabel: 'Preparing Docker runtime',
      scopeFileCount: 0,
      isFullRepository: false,
      checkIds: [],
      checkId: null,
      workerId: null,
      checkStatus: null,
      checkResult: null,
      passedCount: 0,
      failedCount: 0,
      unknownCount: 0,
      checkIndex: 0,
      completedCount: 0,
      totalChecks: 0,
      runningCheckIds: [],
      statusLabel,
      detailLines: [...detailLines]
    } satisfies ScanProgressEvent;

    const snapshot = JSON.stringify({
      statusLabel: event.statusLabel,
      detailLines: event.detailLines
    });
    if (snapshot === lastSnapshot) {
      return;
    }

    lastSnapshot = snapshot;
    hooks.onProgress?.(event);
  };

  return {
    setStatus(nextStatusLabel: string) {
      statusLabel = nextStatusLabel;
      emit();
    },
    pushLine(line: string) {
      const normalized = sanitizeProgressLine(line);
      if (!normalized) {
        return;
      }

      detailLines.push(normalized);
      if (detailLines.length > MAX_PROGRESS_DETAIL_LINES) {
        detailLines.splice(0, detailLines.length - MAX_PROGRESS_DETAIL_LINES);
      }

      emit();
    }
  };
}

function createLineBuffer(onLine: (line: string) => void): {
  push: (chunk: Buffer | string) => void;
  flush: () => void;
} {
  let buffer = '';

  const flushCompleteLines = () => {
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trimEnd();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        onLine(line);
      }
    }
  };

  return {
    push(chunk: Buffer | string) {
      buffer += normalizeLineBreaks(chunk.toString());
      flushCompleteLines();
    },
    flush() {
      const line = buffer.trim();
      buffer = '';
      if (line) {
        onLine(line);
      }
    }
  };
}

async function runStreamingProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    allowedExitCodes?: number[];
    onStdoutLine?: (line: string) => void;
    onStderrLine?: (line: string) => void;
  }
): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const stdoutBuffer = createLineBuffer(line => {
      stdoutLines.push(line);
      options.onStdoutLine?.(line);
    });
    const stderrBuffer = createLineBuffer(line => {
      stderrLines.push(line);
      options.onStderrLine?.(line);
    });

    child.stdout.on('data', chunk => {
      stdoutBuffer.push(chunk);
    });

    child.stderr.on('data', chunk => {
      stderrBuffer.push(chunk);
    });

    child.on('error', reject);
    child.on('close', code => {
      stdoutBuffer.flush();
      stderrBuffer.flush();

      const allowedExitCodes = options.allowedExitCodes ?? [0];
      if (allowedExitCodes.includes(code ?? -1)) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed (${command} ${args.join(' ')}): ${
            stderrLines.join('\n').trim()
            || stdoutLines.join('\n').trim()
            || `exit code ${code}`
          }`
        )
      );
    });
  });
}

async function computeDockerRuntimeContextHash(toolRoot: string): Promise<string> {
  const hash = createHash('sha256');
  const includedPaths = [
    'docker/openshrike-runtime.Dockerfile',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vitest.config.ts',
    'src',
    'best_practices',
    'docs'
  ];

  for (const relativePath of includedPaths) {
    const absolutePath = path.join(toolRoot, relativePath);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      const files = await collectFilesRecursively(absolutePath);
      for (const filePath of files) {
        await appendFileHash(hash, toolRoot, filePath);
      }
      continue;
    }

    if (stats.isFile()) {
      await appendFileHash(hash, toolRoot, absolutePath);
    }
  }

  return hash.digest('hex');
}

async function collectFilesRecursively(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  const files = await Promise.all(entries.map(async entry => {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return await collectFilesRecursively(absolutePath);
    }

    return entry.isFile() ? [absolutePath] : [];
  }));

  return files.flat().sort((left, right) => left.localeCompare(right));
}

async function appendFileHash(
  hash: ReturnType<typeof createHash>,
  rootPath: string,
  filePath: string
): Promise<void> {
  const relativePath = path.relative(rootPath, filePath).replaceAll(path.sep, '/');
  hash.update(relativePath);
  hash.update('\0');
  hash.update(await fs.readFile(filePath));
  hash.update('\0');
}

async function runChecks(options: {
  checkIds: string[];
  parallelism: number;
  worker: (job: {checkId: string; workerId: string}) => Promise<void>;
}): Promise<void> {
  const concurrency = Math.max(1, Math.min(options.parallelism, options.checkIds.length || 1));
  let nextIndex = 0;
  let fatalError: unknown = null;

  const workers = Array.from({length: concurrency}, (_, workerIndex) => workerLoop(workerIndex + 1));
  const results = await Promise.allSettled(workers);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  if (rejected) {
    throw rejected.reason;
  }

  if (fatalError) {
    throw fatalError;
  }

  async function workerLoop(workerNumber: number): Promise<void> {
    const workerId = `worker-${workerNumber}`;

    while (true) {
      if (fatalError) {
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= options.checkIds.length) {
        return;
      }

      try {
        await options.worker({
          checkId: options.checkIds[currentIndex]!,
          workerId
        });
      } catch (error) {
        fatalError = fatalError ?? error;
        throw error;
      }
    }
  }
}

async function resolveScanCheckSelection(options: ScanCommandOptions): Promise<{
  bundleId: string;
  version: string;
  checkIds: string[];
}> {
  if (options.projectChecksDir) {
    const selection = await resolveProjectCheckSelection(options.projectChecksDir, options.checkId);
    return {
      bundleId: options.checkId ? selection.checkIds[0]! : 'project-checks',
      version: selection.version,
      checkIds: selection.checkIds
    };
  }

  const policy = options.policyId ? await resolvePolicyDefinition(options.policyId) : null;
  return {
    bundleId: policy?.id ?? options.checkId!,
    version: policy?.version ?? new Date().toISOString().slice(0, 10),
    checkIds: policy ? policy.checkIds : [options.checkId!]
  };
}

export async function resolveDockerRuntimeMountPlan(
  repoPath: string,
  projectChecksPath: string | null
): Promise<{
  workspaceHostPath: string;
  repoContainerPath: string;
  projectChecksContainerPath?: string;
  safeDirectories: string[];
  extraMounts: DockerBindMount[];
}> {
  const repoFullPath = path.resolve(repoPath);
  const resolvedProjectChecksPath = projectChecksPath ? path.resolve(projectChecksPath) : null;
  const repoContext = await resolveGitRepositoryContext(repoFullPath);
  const workspaceAnchorHostPath = repoContext?.worktreeRootHostPath ?? repoFullPath;
  const workspaceHostPath = resolveDockerWorkspaceHostPath(
    workspaceAnchorHostPath,
    resolvedProjectChecksPath
  );
  const repoContainerPath = resolveDockerWorkspacePath(workspaceHostPath, repoFullPath);
  const projectChecksContainerPath = resolvedProjectChecksPath
    ? resolveDockerWorkspacePath(workspaceHostPath, resolvedProjectChecksPath)
    : undefined;
  const worktreeRootContainerPath = repoContext
    ? resolveDockerWorkspacePath(workspaceHostPath, repoContext.worktreeRootHostPath)
    : null;
  const safeDirectories = dedupeIgnoredRepoPaths([
    repoContainerPath,
    ...(worktreeRootContainerPath ? [worktreeRootContainerPath] : [])
  ]);

  return {
    workspaceHostPath,
    repoContainerPath,
    ...(projectChecksContainerPath ? {projectChecksContainerPath} : {}),
    safeDirectories,
    extraMounts: repoContext && worktreeRootContainerPath
      ? resolveDockerGitMetadataMounts(repoContext, worktreeRootContainerPath)
      : []
  };
}

function resolveDockerWorkspaceHostPath(
  repoFullPath: string,
  projectChecksPath: string | null
): string {
  if (!projectChecksPath) {
    return repoFullPath;
  }

  let current = path.resolve(repoFullPath);
  const resolvedChecksPath = path.resolve(projectChecksPath);

  while (true) {
    const relative = path.relative(current, resolvedChecksPath);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return repoFullPath;
    }

    current = parent;
  }
}

function resolveDockerWorkspacePath(workspaceHostPath: string, targetHostPath: string): string {
  const relativePath = path.relative(workspaceHostPath, targetHostPath);
  return relativePath
    ? path.posix.join('/workspace/repo', relativePath.split(path.sep).join('/'))
    : '/workspace/repo';
}

export function resolveDockerRepoVisibleIgnoredPaths(options: {
  repoContainerPath: string;
  workspaceHostPath: string;
  hostPaths: string[];
}): string[] {
  return dedupeIgnoredRepoPaths(
    options.hostPaths.flatMap(hostPath => {
      const resolvedHostPath = path.resolve(hostPath);
      const relativeToWorkspace = path.relative(options.workspaceHostPath, resolvedHostPath);
      if (
        !relativeToWorkspace ||
        relativeToWorkspace.startsWith('..') ||
        path.isAbsolute(relativeToWorkspace)
      ) {
        return [];
      }

      const containerPath = resolveDockerWorkspacePath(options.workspaceHostPath, resolvedHostPath);
      const relativeToRepo = path.posix.relative(options.repoContainerPath, containerPath);
      if (
        !relativeToRepo ||
        relativeToRepo.startsWith('..') ||
        path.posix.isAbsolute(relativeToRepo)
      ) {
        return [];
      }

      return [normalizeRelativePath(relativeToRepo)];
    })
  );
}

export async function resolveDockerOpenCodeHostAccess(options: {
  artifactsDir: string;
  runtimeConfig: LoadedRuntimeConfig | null;
  homePath?: string;
}): Promise<{
  env: Record<string, string>;
  mounts: DockerBindMount[];
  passThroughEnvVarNames: string[];
}> {
  const runtimeHomeHostPath = path.join(
    path.resolve(options.artifactsDir),
    DOCKER_OPENCODE_HOME_DIRECTORY_NAME
  );
  const runtimeHomeContainerPath = path.posix.join('/io', DOCKER_OPENCODE_HOME_DIRECTORY_NAME);
  await Promise.all([
    fs.mkdir(path.join(runtimeHomeHostPath, '.config', 'opencode'), {recursive: true}),
    fs.mkdir(path.join(runtimeHomeHostPath, '.local', 'share', 'opencode'), {recursive: true}),
    fs.mkdir(path.join(runtimeHomeHostPath, '.local', 'state'), {recursive: true}),
    fs.mkdir(path.join(runtimeHomeHostPath, '.cache'), {recursive: true})
  ]);

  const homePath = path.resolve(options.homePath ?? os.homedir());
  const configDirPath = path.join(homePath, '.config', 'opencode');
  const dataDirPath = path.join(homePath, '.local', 'share', 'opencode');
  const [hasConfigDir, hasDataDir] = await Promise.all([
    pathIsDirectory(configDirPath),
    pathIsDirectory(dataDirPath)
  ]);

  return {
    env: {
      HOME: runtimeHomeContainerPath,
      XDG_CONFIG_HOME: path.posix.join(runtimeHomeContainerPath, '.config'),
      XDG_DATA_HOME: path.posix.join(runtimeHomeContainerPath, '.local', 'share'),
      XDG_STATE_HOME: path.posix.join(runtimeHomeContainerPath, '.local', 'state'),
      XDG_CACHE_HOME: path.posix.join(runtimeHomeContainerPath, '.cache')
    },
    mounts: dedupeDockerMounts([
      ...(hasConfigDir ? [{
        source: configDirPath,
        target: path.posix.join(runtimeHomeContainerPath, '.config', 'opencode'),
        readonly: true
      } satisfies DockerBindMount] : []),
      ...(hasDataDir ? [{
        source: dataDirPath,
        target: path.posix.join(runtimeHomeContainerPath, '.local', 'share', 'opencode'),
        readonly: false
      } satisfies DockerBindMount] : [])
    ]),
    passThroughEnvVarNames: collectDockerPassThroughEnvVarNames(options.runtimeConfig)
  };
}

async function pathIsDirectory(candidatePath: string): Promise<boolean> {
  return await fs.stat(candidatePath).then(
    stats => stats.isDirectory(),
    () => false
  );
}

function applyDockerHostEnvironment(
  env: NodeJS.ProcessEnv,
  values: Record<string, string>
): string[] {
  const names: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    env[name] = value;
    names.push(name);
  }

  return names;
}

function applyGitSafeDirectoryEnv(
  env: NodeJS.ProcessEnv,
  safeDirectories: string[]
): string[] {
  const envVarNames: string[] = [];
  const baseCount = Number.parseInt(env.GIT_CONFIG_COUNT ?? '', 10);
  let nextIndex = Number.isFinite(baseCount) && baseCount >= 0 ? baseCount : 0;

  for (const safeDirectory of safeDirectories) {
    const keyName = `GIT_CONFIG_KEY_${nextIndex}`;
    const valueName = `GIT_CONFIG_VALUE_${nextIndex}`;
    env[keyName] = 'safe.directory';
    env[valueName] = safeDirectory;
    envVarNames.push(keyName, valueName);
    nextIndex += 1;
  }

  env.GIT_CONFIG_COUNT = String(nextIndex);
  envVarNames.unshift('GIT_CONFIG_COUNT');
  return envVarNames;
}

function applyDockerUserIdentity(dockerArgs: string[]): void {
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
    return;
  }

  dockerArgs.push('--user', `${process.getuid()}:${process.getgid()}`);
}

async function resolveGitRepositoryContext(repoPath: string): Promise<GitRepositoryContext | null> {
  try {
    const {stdout} = await runProcess('git', [
      '-C',
      repoPath,
      'rev-parse',
      '--show-toplevel',
      '--absolute-git-dir',
      '--path-format=absolute',
      '--git-common-dir'
    ], {
      cwd: repoPath
    });
    const lines = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const [worktreeRootHostPath, gitDirHostPath, gitCommonDirHostPath] = lines;
    if (!worktreeRootHostPath || !gitDirHostPath || !gitCommonDirHostPath) {
      return null;
    }

    const gitDirReference = await readGitDirReference(path.join(worktreeRootHostPath, '.git'));
    const commonDirReference = await readGitPathReference(path.join(gitDirHostPath, 'commondir'));

    return {
      worktreeRootHostPath: path.resolve(worktreeRootHostPath),
      gitDirHostPath: path.resolve(gitDirHostPath),
      gitCommonDirHostPath: path.resolve(gitCommonDirHostPath),
      gitDirReference,
      commonDirReference,
      usesLinkedGitDir: gitDirReference !== null
    };
  } catch {
    return null;
  }
}

async function readGitDirReference(filePath: string): Promise<string | null> {
  const isFile = await fs.stat(filePath).then(
    stats => stats.isFile(),
    () => false
  );
  if (!isFile) {
    return null;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const match = raw.match(/^\s*gitdir:\s*(.+)\s*$/imu);
  return match?.[1]?.trim() || null;
}

async function readGitPathReference(filePath: string): Promise<string | null> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }

  return raw
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) ?? null;
}

function resolveDockerGitMetadataMounts(
  context: GitRepositoryContext,
  worktreeRootContainerPath: string
): DockerBindMount[] {
  if (!context.usesLinkedGitDir || !context.gitDirReference) {
    return [];
  }

  const gitDirContainerPath = resolveContainerReferencePath(
    worktreeRootContainerPath,
    context.gitDirReference
  );
  const mounts: DockerBindMount[] = [
    {
      source: context.gitDirHostPath,
      target: gitDirContainerPath,
      readonly: true
    }
  ];

  if (context.commonDirReference) {
    mounts.push({
      source: context.gitCommonDirHostPath,
      target: resolveContainerReferencePath(gitDirContainerPath, context.commonDirReference),
      readonly: true
    });
  } else if (context.gitCommonDirHostPath !== context.gitDirHostPath) {
    mounts.push({
      source: context.gitCommonDirHostPath,
      target: context.gitCommonDirHostPath,
      readonly: true
    });
  }

  return dedupeDockerMounts(mounts);
}

function resolveContainerReferencePath(baseContainerPath: string, reference: string): string {
  const normalizedReference = reference.replaceAll('\\', '/');
  return path.posix.isAbsolute(normalizedReference)
    ? path.posix.normalize(normalizedReference)
    : path.posix.normalize(path.posix.resolve(baseContainerPath, normalizedReference));
}

function dedupeDockerMounts(mounts: DockerBindMount[]): DockerBindMount[] {
  const result: DockerBindMount[] = [];
  const seen = new Set<string>();

  for (const mount of mounts) {
    const key = `${mount.source}\u0000${mount.target}\u0000${mount.readonly}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(mount);
  }

  return result;
}

function dedupeEnvVarNames(names: string[]): string[] {
  return [...new Set(names)];
}

function formatDockerBindMount(mount: DockerBindMount): string {
  return `type=bind,src=${mount.source},dst=${mount.target}${mount.readonly ? ',readonly' : ''}`;
}

function collectDockerPassThroughEnvVarNames(
  runtimeConfig: LoadedRuntimeConfig | null
): string[] {
  return [...new Set(runtimeConfig?.requiredEnvVars ?? [])]
    .filter(name => {
      const value = process.env[name];
      return typeof value === 'string' && value.length > 0;
    })
    .sort((left, right) => left.localeCompare(right));
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitizeProgressLine(line: string): string {
  return line
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .trim();
}

function normalizeRelativePath(value: string): string {
  return value.trim().replaceAll(path.sep, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
}

function resolveEffectiveParallelism(requested: number | 'auto', checkCount: number): number {
  if (checkCount <= 1) {
    return Math.max(1, checkCount);
  }

  if (requested === 'auto') {
    const available = typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
    return Math.max(1, Math.min(checkCount, Math.min(4, available)));
  }

  return Math.max(1, Math.min(checkCount, requested));
}

function emitProgress(
  logger: Awaited<ReturnType<typeof createScanLogger>>,
  hooks: ScanHooks,
  type: ScanProgressEventType,
  scopeContext: Awaited<ReturnType<typeof resolveScanScope>>,
  progressState: ProgressState,
  checkOrder: string[],
  checkId: string | null,
  workerId: string | null,
  checkStatus: CheckResult['status'] | null,
  checkResult: CheckResult | null
): void {
  const statusLabel = type === 'scope-resolved'
    ? 'Scope resolved'
    : type === 'no-changes-in-scope'
      ? 'No files matched the selected scope'
      : type === 'check-started'
        ? (checkId ? `Running ${checkId}` : 'Running check')
        : checkId && checkStatus
          ? `Completed ${checkId} (${checkStatus})`
          : 'Check completed';
  const event = {
    type,
    scopeLabel: scopeContext.label,
    scopeFileCount: scopeContext.files.length,
    isFullRepository: scopeContext.isFullRepository,
    checkIds: [...checkOrder],
    checkId,
    workerId,
    checkStatus,
    checkResult,
    passedCount: countChecks(progressState.resultsByCheckId, 'pass'),
    failedCount: countChecks(progressState.resultsByCheckId, 'fail'),
    unknownCount: countChecks(progressState.resultsByCheckId, 'unknown'),
    checkIndex: progressState.completedCount,
    completedCount: progressState.completedCount,
    totalChecks: checkOrder.length,
    runningCheckIds: checkOrder.filter(candidate => progressState.runningCheckIds.has(candidate)),
    statusLabel,
    detailLines: []
  } satisfies ScanProgressEvent;

  logger?.write('scan.progress', event);
  hooks.onProgress?.(event);
}

function countChecks(
  resultsByCheckId: Map<string, CheckResult>,
  status: CheckResult['status']
): number {
  let count = 0;
  for (const result of resultsByCheckId.values()) {
    if (result.status === status) {
      count += 1;
    }
  }

  return count;
}

function buildReport(options: {
  bundleId: string;
  policyVersion: string;
  repoPath: string;
  checks: CheckResult[];
  runtimeMode: RuntimeMode;
  requestedParallelism: number | 'auto';
  effectiveParallelism: number;
  artifactsDir: string | null;
}): ScanReport {
  const sortedChecks = sortChecksByStatus(options.checks);

  return {
    bundle_id: options.bundleId,
    policy_version: options.policyVersion,
    repo: {
      path: options.repoPath
    },
    execution: {
      runtime_mode: options.runtimeMode,
      requested_parallelism: options.requestedParallelism,
      effective_parallelism: options.effectiveParallelism,
      artifacts_dir: options.artifactsDir
    },
    summary: {
      total_checks: sortedChecks.length,
      passed: sortedChecks.filter(check => check.status === 'pass').length,
      failed: sortedChecks.filter(check => check.status === 'fail').length,
      unknown: sortedChecks.filter(check => check.status === 'unknown').length
    },
    checks: sortedChecks
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

function createPendingSavedResult(checkId: string, wasInProgress: boolean): CheckResult {
  return {
    id: checkId,
    version: '0.1.0',
    status: 'unknown',
    confidence: 'LOW',
    evidence: [],
    rationale: wasInProgress
      ? 'This check was still running when the last-scan state was saved.'
      : 'This check had not completed when the last-scan state was saved.',
    remediation: [
      'Resume from the saved report and recheck this finding if needed.',
      'Run a fresh `shrike scan` to regenerate a fully completed report.'
    ]
  };
}

async function evaluateCheckWithRecovery(options: {
  checkId: string;
  workerId: string;
  repoPath: string;
  agent: string;
  model: string;
  runtimeConfigPath?: string | undefined;
  projectChecksDir?: string | undefined;
  scopeContext: Awaited<ReturnType<typeof resolveScanScope>>;
  emulateOpencode: boolean;
  runtime: OpenCodeRuntime | null;
  ignoredRepoPaths: string[];
  logger: Awaited<ReturnType<typeof createScanLogger>>;
}): Promise<CheckResult> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= CHECK_EVALUATION_MAX_ATTEMPTS; attempt += 1) {
    const guard = await RepoMutationGuard.capture(options.repoPath, {
      ignoredPaths: options.ignoredRepoPaths
    });

    try {
      const result = await evaluateCheck({
        checkId: options.checkId,
        projectChecksDir: options.projectChecksDir,
        repoPath: options.repoPath,
        agent: options.agent,
        model: options.model,
        workerId: options.workerId,
        scopeContext: options.scopeContext,
        emulateOpencode: options.emulateOpencode,
        runtime: options.runtime
      });
      await guard.throwIfMutated();
      return result;
    } catch (error) {
      lastError = error;

      try {
        await guard.throwIfMutated();
      } catch (guardError) {
        throw guardError;
      }

      const message = error instanceof Error ? error.message : String(error);
      options.logger?.write('check.attempt.failed', {
        checkId: options.checkId,
        workerId: options.workerId,
        attempt,
        maxAttempts: CHECK_EVALUATION_MAX_ATTEMPTS,
        message
      });

      const fatalSetupError = classifyFatalCheckError(error, {
        model: options.model,
        configPath: options.runtimeConfigPath
      });
      if (fatalSetupError) {
        throw fatalSetupError;
      }

      if (!isRecoverableCheckError(error)) {
        throw error;
      }

      if (attempt < CHECK_EVALUATION_MAX_ATTEMPTS) {
        options.logger?.write('check.retry.scheduled', {
          checkId: options.checkId,
          workerId: options.workerId,
          nextAttempt: attempt + 1
        });
        continue;
      }
    }
  }

  options.logger?.write('check.inconclusive', {
    checkId: options.checkId,
    workerId: options.workerId,
    attempts: CHECK_EVALUATION_MAX_ATTEMPTS,
    message: lastError instanceof Error ? lastError.message : String(lastError)
  });
  return createInconclusiveResult(
    options.checkId,
    lastError,
    CHECK_EVALUATION_MAX_ATTEMPTS
  );
}

function isRecoverableCheckError(error: unknown): boolean {
  return error instanceof CheckEvaluationError;
}

function createInconclusiveResult(
  checkId: string,
  error: unknown,
  attempts: number
): CheckResult {
  const message = normalizeCheckErrorMessage(error);
  const originalOutput = extractOriginalCheckOutput(error);
  const rationaleParts = [
    `Inconclusive result after ${attempts} attempt(s): ${message}`
  ];

  if (originalOutput) {
    rationaleParts.push(`Original agent result:\n${originalOutput}`);
  }

  return {
    id: checkId,
    version: '0.1.0',
    status: 'unknown',
    confidence: 'LOW',
    evidence: [],
    rationale: rationaleParts.join('\n\n'),
    remediation: [
      'Review the check output and rerun the scan.',
      "If the check keeps returning out-of-scope evidence, retry with a broader scope such as '--scan-scope full'."
    ]
  };
}

function normalizeCheckErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim();
}

function extractOriginalCheckOutput(error: unknown): string | null {
  const value = getCheckEvaluationOriginalOutput(error);
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= INCONCLUSIVE_OUTPUT_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, INCONCLUSIVE_OUTPUT_MAX_LENGTH).trimEnd()}\n... [truncated]`;
}

function classifyFatalCheckError(
  error: unknown,
  context: {
    model: string;
    configPath?: string | undefined;
  }
): CliError | null {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof CheckEvaluationError) {
    return null;
  }

  const message = normalizeCheckErrorMessage(error);
  if (message.includes('Read-only guardrail violation')) {
    return null;
  }

  if (isProviderSetupFailureMessage(message)) {
    return createProviderSetupCliError(message, {
      model: context.model,
      configPath: context.configPath
    });
  }

  return createOpenCodeRuntimeCliError(message, {
    stage: 'run',
    model: context.model,
    configPath: context.configPath
  });
}

function createRuntimeConfigCliError(
  error: unknown,
  context: {
    configPath?: string | undefined;
    repoPath: string;
    model: string;
  }
): CliError {
  const resolvedConfigPath = path.resolve(context.configPath ?? getDefaultConfigPath(context.repoPath));
  const cause = normalizeCheckErrorMessage(error);

  return new CliError(
    'INVALID_RUNTIME_CONFIG',
    `OpenCode runtime config could not be loaded from ${resolvedConfigPath}.`,
    {
      configPath: resolvedConfigPath,
      model: context.model,
      cause,
      actions: buildOpenCodeSetupActions({
        configPath: resolvedConfigPath,
        model: context.model,
        cause
      })
    }
  );
}

function createMissingEnvironmentCliError(
  runtimeConfig: LoadedRuntimeConfig,
  model: string
): CliError {
  return new CliError(
    'MISSING_ENVIRONMENT',
    'OpenCode provider setup is incomplete, so checks could not start.',
    {
      configPath: runtimeConfig.configPath,
      model,
      missingEnvVars: runtimeConfig.missingEnvVars,
      actions: buildOpenCodeSetupActions({
        configPath: runtimeConfig.configPath,
        model,
        missingEnvVars: runtimeConfig.missingEnvVars
      })
    }
  );
}

function createProviderSetupCliError(
  causeMessage: string,
  context: {
    model: string;
    configPath?: string | undefined;
  }
): CliError {
  return new CliError(
    'OPENCODE_PROVIDER_SETUP_FAILED',
    'OpenCode provider setup failed before checks could run.',
    {
      ...(context.configPath ? {configPath: context.configPath} : {}),
      model: context.model,
      cause: causeMessage,
      actions: buildOpenCodeSetupActions({
        configPath: context.configPath,
        model: context.model,
        cause: causeMessage
      })
    }
  );
}

function createOpenCodeRuntimeCliError(
  error: unknown,
  context: {
    stage: 'start' | 'run';
    model: string;
    configPath?: string | undefined;
  }
): CliError {
  const cause = normalizeCheckErrorMessage(error);

  if (isProviderSetupFailureMessage(cause)) {
    return createProviderSetupCliError(cause, {
      model: context.model,
      configPath: context.configPath
    });
  }

  return new CliError(
    context.stage === 'start' ? 'OPENCODE_RUNTIME_START_FAILED' : 'OPENCODE_RUNTIME_FAILED',
    context.stage === 'start'
      ? 'OpenCode runtime failed to start.'
      : 'OpenCode failed while running checks.',
    {
      ...(context.configPath ? {configPath: context.configPath} : {}),
      model: context.model,
      cause,
      actions: buildOpenCodeSetupActions({
        configPath: context.configPath,
        model: context.model,
        cause
      })
    }
  );
}

function buildOpenCodeSetupActions(options: {
  configPath?: string | undefined;
  model: string;
  cause?: string | undefined;
  missingEnvVars?: string[] | undefined;
}): string[] {
  const actions = [
    OPENCODE_EXECUTION_LAYER_NOTE,
    describeRuntimeConfigAction(options.configPath),
    `See the OpenCode provider setup docs: ${OPENCODE_PROVIDERS_DOCS_URL}`,
    "After updating the setup rerun `shrike scan`."
  ];

  if (options.missingEnvVars && options.missingEnvVars.length > 0) {
    actions.splice(
      2,
      0,
      `Set the environment variable(s) referenced by ${describeRuntimeConfigTarget(options.configPath)}: ${options.missingEnvVars.join(', ')}.`
    );
  }

  if (options.cause) {
    actions.splice(
      2,
      0,
      `OpenCode reported: ${options.cause}`
    );
  }

  return actions;
}

function describeRuntimeConfigTarget(configPath?: string): string {
  if (!configPath) {
    return path.resolve(getDefaultConfigPath());
  }

  return configPath === DOCKER_RUNTIME_CONFIG_PATH_LABEL
    ? 'the injected Docker runtime config and your host OpenCode setup'
    : path.resolve(configPath);
}

function describeRuntimeConfigAction(configPath?: string): string {
  if (!configPath) {
    return `Review and edit ${path.resolve(getDefaultConfigPath())} to configure the selected OpenCode model manually.`;
  }

  if (configPath === DOCKER_RUNTIME_CONFIG_PATH_LABEL) {
    return [
      'Docker runtime injects the repo-local OpenCode overlay and reuses your host OpenCode config/auth.',
      'Verify your host OpenCode setup or add provider configuration directly to `.openshrike/opencode.json`.'
    ].join(' ');
  }

  return `Review and edit ${path.resolve(configPath)} to configure the selected OpenCode model manually.`;
}

function isProviderSetupFailureMessage(message: string): boolean {
  return [
    /typo in the url or port/i,
    /\bapi key\b/i,
    /\bauth(?:entication|orization)?\b/i,
    /\bunauthorized\b/i,
    /\bforbidden\b/i,
    /\bresource name\b/i,
    /\bbase ?url\b/i,
    /\bendpoint\b/i,
    /\bdeployment\b/i,
    /\bcredentials?\b/i,
    /\btoken\b/i,
    /\bunknown provider\b/i,
    /\bunknown model\b/i,
    /\bprovider .+ not found\b/i,
    /\bmodel .+ not found\b/i,
    /\bECONNREFUSED\b/i,
    /\bENOTFOUND\b/i,
    /\bEAI_AGAIN\b/i,
    /\bgetaddrinfo\b/i
  ].some(pattern => pattern.test(message));
}

function resolveIgnoredRepoPaths(repoPath: string, ...candidatePaths: Array<string | null | undefined>): string[] {
  return dedupeIgnoredRepoPaths(
    candidatePaths.flatMap(candidatePath => {
      if (!candidatePath) {
        return [];
      }

      const relativePath = path.relative(repoPath, path.resolve(candidatePath));
      if (
        !relativePath ||
        relativePath.startsWith('..') ||
        path.isAbsolute(relativePath)
      ) {
        return [];
      }

      return [normalizeRelativePath(relativePath)];
    })
  );
}

function dedupeIgnoredRepoPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const candidatePath of paths.map(normalizeRelativePath).filter(Boolean)) {
    if (seen.has(candidatePath)) {
      continue;
    }

    seen.add(candidatePath);
    deduped.push(candidatePath);
  }

  return deduped;
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
    case 'command.executed': {
      const properties = runtimeEvent.properties as
        | {
            sessionID?: string;
            name?: string;
            arguments?: string;
          }
        | undefined;
      return {
        type: runtimeEvent.type,
        sessionID: properties?.sessionID ?? null,
        name: properties?.name ?? null,
        arguments: properties?.arguments ?? null
      };
    }
    default:
      return {
        type: runtimeEvent.type
      };
  }
}
