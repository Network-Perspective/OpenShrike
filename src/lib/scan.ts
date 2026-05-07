import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Event} from '@opencode-ai/sdk';
import {CliError} from './cli-error.js';
import {
  CHECK_EVALUATION_MAX_ATTEMPTS,
  DEFAULT_AGENT_NAME,
  DEFAULT_DOCKER_IMAGE,
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
  ScanCommandOptions,
  ScanProgressEvent,
  ScanProgressEventType,
  ScanReport,
  ScanRuntimeEvent
} from './types.js';

interface NativeScanExecutionOptions {
  runtimeMode: RuntimeMode;
  runtimeConfigOverride?: LoadedRuntimeConfig | null | undefined;
}

interface ProgressState {
  resultsByCheckId: Map<string, CheckResult>;
  runningCheckIds: Set<string>;
  completedCount: number;
}

const OPENCODE_PROVIDERS_DOCS_URL = 'https://opencode.ai/docs/providers/';
const OPENCODE_EXECUTION_LAYER_NOTE = 'OpenShrike uses OpenCode as its agent execution layer, so scans cannot run until OpenCode is configured correctly.';

export interface ScanHooks {
  onProgress?: (event: ScanProgressEvent) => void;
  onRuntimeEvent?: (event: ScanRuntimeEvent) => void;
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
          model
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

    const ignoredRepoPaths = resolveIgnoredRepoPaths(repoFullPath, logger?.path);

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
        model
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

  const imageRef = options.image?.trim() || DEFAULT_DOCKER_IMAGE;
  if (!options.image) {
    await ensureDockerRuntimeImage(imageRef);
  }

  const artifactsDir = await resolveDockerArtifactsDirectory(options);
  const requestHostPath = path.join(artifactsDir, DOCKER_SCAN_REQUEST_FILE);
  const reportHostPath = path.join(artifactsDir, DOCKER_SCAN_REPORT_FILE);
  const logHostPath = path.join(artifactsDir, path.basename(options.logPath ?? DOCKER_SCAN_LOG_FILE));
  const request: DockerScanRequest = {
    options: {
      ...options,
      repoPath: '/workspace/repo',
      runtimeMode: 'docker',
      logPath: '/io/' + path.basename(logHostPath),
      artifactsDir: '/io',
      ui: false
    },
    reportPath: '/io/' + path.basename(reportHostPath)
  };

  await fs.writeFile(requestHostPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');

  const dockerArgs = [
    'run',
    '--rm',
    '--mount', `type=bind,src=${repoFullPath},dst=/workspace/repo,readonly`,
    '--mount', `type=bind,src=${artifactsDir},dst=/io`,
    '--workdir', '/workspace/tool'
  ];

  const dockerEnv: NodeJS.ProcessEnv = {
    ...process.env
  };
  if (runtimeConfig) {
    dockerEnv[DOCKER_RUNTIME_CONFIG_ENV] = Buffer.from(
      JSON.stringify(runtimeConfig.config),
      'utf8'
    ).toString('base64');
    dockerArgs.push('-e', DOCKER_RUNTIME_CONFIG_ENV);
  }
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
  const stderrChunks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      cwd: findToolRoot(),
      env: dockerEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';

    const handleStdoutLine = (line: string) => {
      if (!line) {
        return;
      }

      const wireMessage = tryDecodeDockerWireMessage(line);
      if (!wireMessage) {
        stdoutLines.push(line);
        return;
      }

      if (wireMessage.kind === 'progress') {
        hooks.onProgress?.(wireMessage.event);
        return;
      }

      hooks.onRuntimeEvent?.(wireMessage.event);
    };

    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString();

      while (true) {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }

        const line = stdoutBuffer.slice(0, newlineIndex).trimEnd();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        handleStdoutLine(line);
      }
    });

    child.stderr.on('data', chunk => {
      stderrChunks.push(chunk.toString());
    });

    child.on('error', reject);
    child.on('close', code => {
      if (stdoutBuffer.trim()) {
        handleStdoutLine(stdoutBuffer.trimEnd());
      }

      if (code === 0 || code === 2) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `Docker scan worker exited with code ${code}.`,
            stderrChunks.join('').trim(),
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

async function ensureDockerRuntimeImage(imageRef: string): Promise<void> {
  const toolRoot = findToolRoot();
  const dockerfilePath = path.join(toolRoot, 'docker', 'openshrike-runtime.Dockerfile');

  try {
    await runProcess('docker', ['image', 'inspect', imageRef], {
      cwd: toolRoot,
      env: process.env
    });
    return;
  } catch {
    await fs.access(dockerfilePath);
    await runProcess('docker', ['build', '-t', imageRef, '-f', dockerfilePath, '.'], {
      cwd: toolRoot,
      env: process.env
    });
  }
}

async function resolveDockerArtifactsDirectory(options: ScanCommandOptions): Promise<string> {
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
  const gitDirectory = path.join(repoRoot, '.git');
  const gitDirectoryExists = await fs.stat(gitDirectory).then(
    stats => stats.isDirectory(),
    () => false
  );
  const baseDirectory = gitDirectoryExists
    ? path.join(gitDirectory, 'openshrike-artifacts')
    : path.join(repoRoot, '.openshrike-artifacts');
  await fs.mkdir(baseDirectory, {recursive: true});
  return await fs.mkdtemp(path.join(baseDirectory, 'docker-'));
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
    runningCheckIds: checkOrder.filter(candidate => progressState.runningCheckIds.has(candidate))
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

async function evaluateCheckWithRecovery(options: {
  checkId: string;
  workerId: string;
  repoPath: string;
  agent: string;
  model: string;
  runtimeConfigPath?: string | undefined;
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
  const configPath = path.resolve(options.configPath ?? getDefaultConfigPath());
  const actions = [
    OPENCODE_EXECUTION_LAYER_NOTE,
    `Review and edit ${configPath} to configure the selected OpenCode model manually.`,
    `See the OpenCode provider setup docs: ${OPENCODE_PROVIDERS_DOCS_URL}`,
    "After updating the setup rerun `shrike scan`."
  ];

  if (options.missingEnvVars && options.missingEnvVars.length > 0) {
    actions.splice(
      2,
      0,
      `Set the environment variable(s) referenced by ${configPath}: ${options.missingEnvVars.join(', ')}.`
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
