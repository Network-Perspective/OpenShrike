import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadRuntimeConfig} from './config.js';
import {
  DEFAULT_DOCKER_IMAGE,
  DEFAULT_FIX_AGENT_NAME,
  DEFAULT_FIX_MODEL,
  DOCKER_FIX_LOG_FILE,
  DOCKER_FIX_REQUEST_FILE,
  DOCKER_RUNTIME_CONFIG_ENV
} from './constants.js';
import {type DockerWireMessage, tryDecodeDockerWireMessage} from './docker-protocol.js';
import {runFixForCheck} from './fix-runtime.js';
import {findToolRoot} from './project-root.js';
import {sortChecksByStatus} from './report.js';
import {createScanLogger} from './scan-log.js';
import {summarizeRuntimeEvent} from './runtime-events.js';
import {OpenCodeRuntime} from './runtime.js';
import {
  ensureDockerRuntimeImage,
  resolveDockerArtifactsDirectory,
  resolveDockerOpenCodeHostAccess,
  resolveDockerRuntimeMountPlan,
  runScan
} from './scan.js';
import {resolveScanScope} from './scope.js';
import type {
  CheckResult,
  SavedScanRequest,
  SavedScanScope,
  ScanCommandOptions,
  ScanReport,
  ScanRuntimeEvent
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
  onRuntimeEvent?: ((event: ScanRuntimeEvent) => void) | undefined;
}): Promise<CheckResult> {
  const report = await runScan(
    buildActionScanOptions({
      base: options.base,
      request: options.request,
      repoPath: options.repoPath,
      checkId: options.checkId
    }),
    options.onRuntimeEvent
      ? {
          onRuntimeEvent: options.onRuntimeEvent
        }
      : {}
  );
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
  scope?: SavedScanScope | undefined;
  onRuntimeEvent?: ((event: ScanRuntimeEvent) => void) | undefined;
}): Promise<CheckResult> {
  const repoPath = path.resolve(options.report.repo.path);
  const base = {
    ...options.base,
    artifactsDir: options.base.artifactsDir ?? options.report.execution?.artifacts_dir ?? undefined
  };

  if (options.request.runtimeMode === 'docker') {
    await runDockerFixForCheck({
      base,
      request: options.request,
      check: options.check,
      repoPath,
      ...(options.scope ? {scope: options.scope} : {}),
      ...(options.onRuntimeEvent ? {onRuntimeEvent: options.onRuntimeEvent} : {})
    });

    return await recheckSingleCheck({
      base,
      request: options.request,
      repoPath,
      checkId: options.check.id,
      ...(options.onRuntimeEvent ? {onRuntimeEvent: options.onRuntimeEvent} : {})
    });
  }

  const scopeContext = options.scope
    ? deserializeSavedScope(options.scope)
    : await resolveScanScope(
        repoPath,
        options.request.scanScope,
        options.request.scanTarget ?? undefined
      );
  const runtimeConfig = base.mockOpencode
    ? null
    : await loadRuntimeConfig(base.configPath, {
        agent: base.agent,
        model: base.model,
        fixAgent: base.fixAgent,
        fixModel: base.fixModel
      });
  const logger = await createScanLogger(resolveFixLogPath(base));
  let runtime: OpenCodeRuntime | null = null;

  try {
    runtime = runtimeConfig
      ? await OpenCodeRuntime.create({
          repoPath,
          config: runtimeConfig.config,
          logger,
          onEvent: runtimeEvent => {
            logger?.write('opencode.event', {
              ...summarizeRuntimeEvent(runtimeEvent.event),
              checkId: runtimeEvent.checkId,
              workerId: runtimeEvent.workerId,
              runtimeMode: 'native'
            });
            options.onRuntimeEvent?.({
              checkId: runtimeEvent.checkId,
              workerId: runtimeEvent.workerId,
              runtimeMode: 'native',
              event: runtimeEvent.event
            });
          }
        })
      : null;
    logger?.write('fix.started', {
      checkId: options.check.id,
      repoPath,
      runtimeMode: 'native',
      agent: base.fixAgent ?? base.agent ?? DEFAULT_FIX_AGENT_NAME,
      model: base.fixModel ?? base.model ?? DEFAULT_FIX_MODEL
    });
    await runFixForCheck({
      check: options.check,
      request: options.request,
      repoPath,
      projectChecksDir: options.request.projectChecksDir ?? undefined,
      agent: base.fixAgent ?? base.agent ?? DEFAULT_FIX_AGENT_NAME,
      model: base.fixModel ?? base.model ?? DEFAULT_FIX_MODEL,
      runtime,
      emulateOpencode: base.mockOpencode,
      scopeContext
    });
    logger?.write('fix.completed', {
      checkId: options.check.id,
      repoPath,
      runtimeMode: 'native'
    });
  } catch (error) {
    logger?.write('fix.failed', {
      checkId: options.check.id,
      repoPath,
      runtimeMode: 'native',
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await runtime?.close();
    await logger?.close().catch(() => undefined);
  }

  return await recheckSingleCheck({
    base,
    request: options.request,
    repoPath,
    checkId: options.check.id,
    ...(options.onRuntimeEvent ? {onRuntimeEvent: options.onRuntimeEvent} : {})
  });
}

async function runDockerFixForCheck(options: {
  base: ScanCommandOptions;
  request: SavedScanRequest;
  check: CheckResult;
  repoPath: string;
  scope?: SavedScanScope | undefined;
  onRuntimeEvent?: ((event: ScanRuntimeEvent) => void) | undefined;
}): Promise<void> {
  const runtimeConfig = options.base.mockOpencode
    ? null
    : await loadRuntimeConfig(options.base.configPath, {
        agent: options.base.agent,
        model: options.base.model,
        fixAgent: options.base.fixAgent,
        fixModel: options.base.fixModel
      });

  const customImage = options.base.image?.trim();
  const imageRef = customImage || DEFAULT_DOCKER_IMAGE;
  if (!customImage) {
    await ensureDockerRuntimeImage(imageRef);
  }

  const artifactsDir = await resolveDockerArtifactsDirectory(options.base);
  const requestHostPath = path.join(artifactsDir, DOCKER_FIX_REQUEST_FILE);
  const logHostPath = resolveFixLogPath({
    ...options.base,
    artifactsDir
  });
  const projectChecksHostPath = options.request.projectChecksDir
    ? path.resolve(options.request.projectChecksDir)
    : null;
  const mountPlan = await resolveDockerRuntimeMountPlan(options.repoPath, projectChecksHostPath);
  const opencodeHostAccess = await resolveDockerOpenCodeHostAccess({
    artifactsDir,
    runtimeConfig
  });
  const dockerRequest = {
    repoPath: mountPlan.repoContainerPath,
    projectChecksDir: mountPlan.projectChecksContainerPath ?? null,
    logPath: logHostPath ? `/io/${path.basename(logHostPath)}` : null,
    request: options.request,
    check: options.check,
    ...(options.scope ? {scope: options.scope} : {}),
    agent: options.base.fixAgent ?? options.base.agent ?? DEFAULT_FIX_AGENT_NAME,
    model: options.base.fixModel ?? options.base.model ?? DEFAULT_FIX_MODEL,
    emulateOpencode: options.base.mockOpencode
  };

  await fs.writeFile(requestHostPath, `${JSON.stringify(dockerRequest, null, 2)}\n`, 'utf8');

  const dockerArgs = [
    'run',
    '--rm',
    '--mount', `type=bind,src=${mountPlan.workspaceHostPath},dst=/workspace/repo`,
    '--mount', `type=bind,src=${artifactsDir},dst=/io`,
    '--workdir', '/workspace/tool'
  ];
  mountPlan.extraMounts
    .map(mount => ({
      ...mount,
      readonly: false
    }))
    .forEach(mount => {
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
  dedupeEnvVarNames(containerEnvVars).forEach(name => {
    dockerArgs.push('-e', name);
  });
  dockerArgs.push(
    imageRef,
    'node',
    'dist/cli.js',
    'internal',
    'fix-worker',
    '--request',
    `/io/${path.basename(requestHostPath)}`
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      cwd: findToolRoot(),
      env: dockerEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const stdoutBuffer = createLineBuffer(line => {
      const wireMessage = tryDecodeDockerWireMessage(line);
      if (!wireMessage) {
        stdoutLines.push(line);
        return;
      }

      if (wireMessage.kind === 'runtime') {
        options.onRuntimeEvent?.(wireMessage.event);
      }
    });
    const stderrBuffer = createLineBuffer(line => {
      stderrLines.push(line);
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

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `Docker fix worker exited with code ${code}.`,
            logHostPath ? `Fix debug log: ${logHostPath}` : '',
            stderrLines.join('\n').trim(),
            stdoutLines.join('\n').trim()
          ].filter(Boolean).join('\n')
        )
      );
    });
  });
}

function deserializeSavedScope(scope: SavedScanScope) {
  return {
    kind: scope.kind,
    label: scope.label,
    files: [...scope.files],
    isFullRepository: scope.isFullRepository
  };
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

function dedupeEnvVarNames(names: string[]): string[] {
  return [...new Set(names)];
}

function formatDockerBindMount(mount: {
  source: string;
  target: string;
  readonly: boolean;
}): string {
  return `type=bind,src=${mount.source},dst=${mount.target}${mount.readonly ? ',readonly' : ''}`;
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

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function resolveFixLogPath(
  options: Pick<ScanCommandOptions, 'artifactsDir' | 'logPath'>
): string | undefined {
  if (options.artifactsDir) {
    return path.join(path.resolve(options.artifactsDir), DOCKER_FIX_LOG_FILE);
  }

  if (!options.logPath) {
    return undefined;
  }

  const resolvedLogPath = path.resolve(options.logPath);
  const parsed = path.parse(resolvedLogPath);
  const extension = parsed.ext || '.jsonl';
  const baseName = parsed.ext ? parsed.name : parsed.base;
  return path.join(parsed.dir, `${baseName}.fix${extension}`);
}
