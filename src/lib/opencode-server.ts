import {spawn, type ChildProcessByStdio} from 'node:child_process';
import type {Readable} from 'node:stream';
import {createOpencodeClient, type Config, type OpencodeClient} from '@opencode-ai/sdk';
import {OPENCODE_SERVER_CLOSE_TIMEOUT_MS, OPENCODE_SERVER_START_TIMEOUT_MS} from './constants.js';
import type {ScanLogger} from './scan-log.js';

type SpawnedOpencodeProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface ManagedOpencodeServer {
  client: OpencodeClient;
  pid: number | undefined;
  close(): Promise<void>;
}

export async function createManagedOpencodeServer(options: {
  config: Config;
  port: number;
  logger?: ScanLogger | null | undefined;
}): Promise<ManagedOpencodeServer> {
  const proc = spawn(
    'opencode',
    ['serve', '--hostname=127.0.0.1', `--port=${options.port}`],
    {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config)
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    }
  );

  const url = await waitForServerUrl(proc, OPENCODE_SERVER_START_TIMEOUT_MS);
  const client = createOpencodeClient({
    baseUrl: url
  });

  return {
    client,
    pid: proc.pid,
    async close(): Promise<void> {
      await terminateProcess(proc, OPENCODE_SERVER_CLOSE_TIMEOUT_MS);
      options.logger?.write('runtime.server.closed', {
        pid: proc.pid ?? null
      });
    }
  };
}

async function waitForServerUrl(
  proc: SpawnedOpencodeProcess,
  timeoutMs: number
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let output = '';

    const cleanup = () => {
      clearTimeout(timeoutId);
      proc.stdout.off('data', onOutput);
      proc.stderr.off('data', onOutput);
      proc.off('exit', onExit);
      proc.off('error', onError);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onOutput = (chunk: Buffer | string) => {
      output += chunk.toString();
      const url = extractServerUrl(output);
      if (url) {
        settle(() => resolve(url));
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        reject(new Error(buildServerExitMessage(code, signal, output)));
      });
    };

    const onError = (error: Error) => {
      settle(() => reject(error));
    };

    const timeoutId = setTimeout(() => {
      void terminateProcess(proc, OPENCODE_SERVER_CLOSE_TIMEOUT_MS).catch(() => undefined);
      settle(() => {
        reject(
          new Error(`Timeout waiting for OpenCode server to start after ${timeoutMs}ms.${formatServerOutput(output)}`)
        );
      });
    }, timeoutMs);

    proc.stdout.on('data', onOutput);
    proc.stderr.on('data', onOutput);
    proc.on('exit', onExit);
    proc.on('error', onError);
  });
}

function extractServerUrl(output: string): string | null {
  for (const line of output.split('\n')) {
    if (!line.startsWith('opencode server listening')) {
      continue;
    }

    const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
    if (match) {
      return match[1] ?? null;
    }
  }

  return null;
}

function buildServerExitMessage(
  code: number | null,
  signal: NodeJS.Signals | null,
  output: string
): string {
  const reason = signal ? `signal ${signal}` : `code ${code}`;
  return `OpenCode server exited with ${reason}.${formatServerOutput(output)}`;
}

function formatServerOutput(output: string): string {
  const trimmed = output.trim();
  return trimmed ? ` Server output: ${trimmed}` : '';
}

async function terminateProcess(
  proc: SpawnedOpencodeProcess,
  timeoutMs: number
): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  const waitForExit = waitForProcessExit(proc);
  sendSignal(proc, 'SIGTERM');

  try {
    await promiseWithTimeout(waitForExit, timeoutMs);
  } catch {
    sendSignal(proc, 'SIGKILL');
    await promiseWithTimeout(waitForExit.catch(() => undefined), 1_000).catch(() => undefined);
  } finally {
    proc.stdout.destroy();
    proc.stderr.destroy();
  }
}

function waitForProcessExit(proc: SpawnedOpencodeProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      proc.off('exit', onExit);
      proc.off('error', onError);
    };

    const onExit = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    proc.on('exit', onExit);
    proc.on('error', onError);
  });
}

function sendSignal(
  proc: SpawnedOpencodeProcess,
  signal: NodeJS.Signals
): void {
  const pid = proc.pid;
  if (!pid) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      proc.kill(signal);
      return;
    }

    process.kill(-pid, signal);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
