import fs from 'node:fs/promises';
import path from 'node:path';
import {DOCKER_RUNTIME_CONFIG_ENV} from '../lib/constants.js';
import {parseRuntimeConfigContent, type LoadedRuntimeConfig} from '../lib/config.js';
import {
  encodeDockerWireMessage,
  parseDockerScanRequest,
  serializeScanReport
} from '../lib/docker-protocol.js';
import {runNativeScan} from '../lib/scan.js';
import {validateScanOptions} from '../lib/scan-options.js';
import type {ScanCommandOptions} from '../lib/types.js';

export async function executeInternalScanWorkerCommand(options: {requestPath: string}): Promise<number> {
  const request = await loadRequest(options.requestPath);
  const runtimeConfig = readRuntimeConfigFromEnv();
  const report = await runNativeScan(request.options, {
    onProgress: event => {
      process.stdout.write(`${encodeDockerWireMessage({kind: 'progress', event})}\n`);
    },
    onRuntimeEvent: event => {
      process.stdout.write(`${encodeDockerWireMessage({kind: 'runtime', event})}\n`);
    }
  }, {
    runtimeMode: 'docker',
    runtimeConfigOverride: runtimeConfig,
    ignoredRepoPaths: request.ignoredRepoPaths
  });

  await fs.mkdir(path.dirname(request.reportPath), {recursive: true});
  await fs.writeFile(request.reportPath, serializeScanReport(report), 'utf8');
  return report.summary.failed > 0 ? 2 : 0;
}

async function loadRequest(requestPath: string): Promise<{
  options: ScanCommandOptions;
  reportPath: string;
  ignoredRepoPaths: string[];
}> {
  const raw = await fs.readFile(path.resolve(requestPath), 'utf8');
  const request = parseDockerScanRequest(JSON.parse(raw));
  return {
    ...request,
    options: validateScanOptions({
      ...request.options,
      runtimeMode: 'docker',
      ui: false
    })
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
