import fs from 'node:fs/promises';
import path from 'node:path';
import {DOCKER_RUNTIME_CONFIG_ENV} from '../lib/constants.js';
import {parseRuntimeConfigContent, type LoadedRuntimeConfig} from '../lib/config.js';
import {encodeDockerWireMessage, parseDockerFixRequest} from '../lib/docker-protocol.js';
import {runFixForCheck} from '../lib/fix-runtime.js';
import {createScanLogger} from '../lib/scan-log.js';
import {summarizeRuntimeEvent} from '../lib/runtime-events.js';
import {OpenCodeRuntime} from '../lib/runtime.js';
import {resolveScanScope} from '../lib/scope.js';
import type {SavedScanScope} from '../lib/types.js';

export async function executeInternalFixWorkerCommand(options: {requestPath: string}): Promise<number> {
  const request = await loadRequest(options.requestPath);
  const logger = await createScanLogger(request.logPath ?? undefined);
  const runtimeConfig = readRuntimeConfigFromEnv();
  let runtime: OpenCodeRuntime | null = null;

  try {
    if (!request.emulateOpencode && !runtimeConfig) {
      throw new Error('Docker fix worker is missing the injected runtime config.');
    }

    runtime = request.emulateOpencode || !runtimeConfig
      ? null
      : await OpenCodeRuntime.create({
          repoPath: request.repoPath,
          config: runtimeConfig.config,
          logger,
          onEvent: runtimeEvent => {
            logger?.write('opencode.event', {
              ...summarizeRuntimeEvent(runtimeEvent.event),
              checkId: runtimeEvent.checkId,
              workerId: runtimeEvent.workerId,
              runtimeMode: 'docker'
            });
            process.stdout.write(`${encodeDockerWireMessage({
              kind: 'runtime',
              event: {
                checkId: runtimeEvent.checkId,
                workerId: runtimeEvent.workerId,
                runtimeMode: 'docker',
                event: runtimeEvent.event
              }
            })}\n`);
          }
        });
    logger?.write('fix.started', {
      checkId: request.check.id,
      repoPath: request.repoPath,
      runtimeMode: 'docker',
      agent: request.agent,
      model: request.model
    });
    const scopeContext = request.scope
      ? deserializeSavedScope(request.scope)
      : await resolveScanScope(
          request.repoPath,
          request.request.scanScope,
          request.request.scanTarget ?? undefined
        );

    await runFixForCheck({
      check: request.check,
      request: request.request,
      repoPath: request.repoPath,
      projectChecksDir: request.projectChecksDir ?? undefined,
      agent: request.agent,
      model: request.model,
      runtime,
      emulateOpencode: request.emulateOpencode,
      scopeContext
    });
    logger?.write('fix.completed', {
      checkId: request.check.id,
      repoPath: request.repoPath,
      runtimeMode: 'docker'
    });

    return 0;
  } catch (error) {
    logger?.write('fix.failed', {
      checkId: request.check.id,
      repoPath: request.repoPath,
      runtimeMode: 'docker',
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await runtime?.close();
    await logger?.close().catch(() => undefined);
  }
}

async function loadRequest(requestPath: string) {
  const raw = await fs.readFile(path.resolve(requestPath), 'utf8');
  const request = parseDockerFixRequest(JSON.parse(raw));
  return {
    ...request,
    repoPath: path.resolve(request.repoPath),
    projectChecksDir: request.projectChecksDir ? path.resolve(request.projectChecksDir) : null,
    logPath: request.logPath ? path.resolve(request.logPath) : null
  };
}

function readRuntimeConfigFromEnv(): LoadedRuntimeConfig | null {
  const encoded = process.env[DOCKER_RUNTIME_CONFIG_ENV];
  if (!encoded) {
    return null;
  }

  const raw = Buffer.from(encoded, 'base64').toString('utf8');
  return parseRuntimeConfigContent(raw, 'docker-env');
}

function deserializeSavedScope(scope: SavedScanScope) {
  return {
    kind: scope.kind,
    label: scope.label,
    files: [...scope.files],
    isFullRepository: scope.isFullRepository
  };
}
