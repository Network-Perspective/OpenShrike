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
  const opencodeHostAccess = await resolveDockerOpenCodeHostAccess();
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
  const containerEnvVars = [
    ...applyDockerHostEnvironment(dockerEnv, opencodeHostAccess.env)
  ];
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

async function resolveDockerOpenCodeHostAccess(): Promise<{
  env: Record<string, string>;
  mounts: DockerBindMount[];
}> {
  const homePath = path.resolve(os.homedir());
  const configDirPath = path.join(homePath, '.config', 'opencode');
  const dataDirPath = path.join(homePath, '.local', 'share', 'opencode');
  const [hasConfigDir, hasDataDir] = await Promise.all([
    pathIsDirectory(configDirPath),
    pathIsDirectory(dataDirPath)
  ]);

  if (!hasConfigDir && !hasDataDir) {
    return {
      env: {},
      mounts: []
    };
  }

  return {
    env: {
      HOME: homePath,
      XDG_CONFIG_HOME: path.join(homePath, '.config'),
      XDG_DATA_HOME: path.join(homePath, '.local', 'share')
    },
    mounts: dedupeDockerMounts([
      ...(hasConfigDir ? [{
        source: configDirPath,
        target: configDirPath,
        readonly: true
      } satisfies DockerBindMount] : []),
      ...(hasDataDir ? [{
        source: dataDirPath,
        target: dataDirPath,
        readonly: false
      } satisfies DockerBindMount] : [])
    ])
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

function formatDockerBindMount(mount: DockerBindMount): string {
  return `type=bind,src=${mount.source},dst=${mount.target}${mount.readonly ? ',readonly' : ''}`;
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
