import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve('codex-in-docker.sh');

describe('codex-in-docker.sh', () => {
  const tempDirectories: string[] = [];
  const sockets: net.Server[] = [];

  afterEach(async () => {
    await Promise.allSettled(sockets.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    })));

    await Promise.allSettled(tempDirectories.splice(0).map(dir => fs.rm(dir, {recursive: true, force: true})));
  });

  it('does not mount the host docker socket by default and forwards bootstrap timeout/env flags', async () => {
    const setup = await createDockerStubEnvironment();
    const result = await runScript(setup, {
      AZURE_OPENAI_API_KEY: 'test-key',
      OPENSHRIKE_AZURE_OPENAI_BASE_URL: 'https://example.invalid',
      OPENSHRIKE_AZURE_OPENAI_API_VERSION: '2025-04-01-preview'
    }, ['echo', 'hello']);

    expect(result.stderr).toBe('');

    const args = await readCapturedArgs(setup.captureFile);
    expect(args).toContain('run');
    expect(args).toContain(`type=bind,src=${path.resolve()},dst=${path.resolve()}`);
    expect(args).toContain(`type=bind,src=${path.join(setup.homeDir, '.codex')},dst=/root/.codex`);
    expect(args).toContain('CODEX_IN_DOCKER_ALLOW_HOST_DOCKER=0');
    expect(args).toContain('CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC=300');
    expect(args).toContain('AZURE_OPENAI_API_KEY=test-key');
    expect(args).toContain('OPENSHRIKE_AZURE_OPENAI_BASE_URL=https://example.invalid');
    expect(args).toContain('OPENSHRIKE_AZURE_OPENAI_API_VERSION=2025-04-01-preview');
    expect(args).not.toContain(`type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock`);
    expect(args).not.toContain('DOCKER_HOST=unix:///var/run/docker.sock');
    expect(args.slice(-2)).toEqual(['echo', 'hello']);
  });

  it('mounts the configured host docker socket only when explicitly enabled', async () => {
    const setup = await createDockerStubEnvironment();
    const socketPath = path.join(setup.tempDir, 'docker.sock');
    const server = net.createServer();
    sockets.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });

    await runScript(setup, {
      CODEX_IN_DOCKER_ALLOW_HOST_DOCKER: '1',
      CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC: '45',
      DOCKER_SOCK_PATH: socketPath
    }, []);

    const args = await readCapturedArgs(setup.captureFile);
    expect(args).toContain(`type=bind,src=${socketPath},dst=/var/run/docker.sock`);
    expect(args).toContain('CODEX_IN_DOCKER_ALLOW_HOST_DOCKER=1');
    expect(args).toContain('CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC=45');
    expect(args).toContain('DOCKER_HOST=unix:///var/run/docker.sock');
  });

  it('fails fast when host docker is enabled without a valid socket', async () => {
    const setup = await createDockerStubEnvironment();
    const missingSocketPath = path.join(setup.tempDir, 'missing.sock');

    await expect(runScript(setup, {
      CODEX_IN_DOCKER_ALLOW_HOST_DOCKER: '1',
      DOCKER_SOCK_PATH: missingSocketPath
    }, [])).rejects.toMatchObject({
      stdout: expect.stringContaining('"code": "DOCKER_SOCKET_UNAVAILABLE"')
    });

    await expect(runScript(setup, {
      CODEX_IN_DOCKER_ALLOW_HOST_DOCKER: '1',
      DOCKER_SOCK_PATH: missingSocketPath
    }, [])).rejects.toMatchObject({
      stdout: expect.stringContaining(`Docker socket not found at ${missingSocketPath}`)
    });

    await expect(fs.access(setup.captureFile)).rejects.toThrow();
  });

  async function createDockerStubEnvironment(): Promise<{
    tempDir: string;
    homeDir: string;
    binDir: string;
    captureFile: string;
  }> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-codex-in-docker-'));
    tempDirectories.push(tempDir);

    const homeDir = path.join(tempDir, 'home');
    const binDir = path.join(tempDir, 'bin');
    const captureFile = path.join(tempDir, 'docker-args.txt');
    await fs.mkdir(homeDir, {recursive: true});
    await fs.mkdir(binDir, {recursive: true});

    const dockerStubPath = path.join(binDir, 'docker');
    await fs.writeFile(
      dockerStubPath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'capture_file="${DOCKER_ARGS_CAPTURE_FILE:?}"',
        ': > "${capture_file}"',
        'for arg in "$@"; do',
        '  printf "%s\\n" "${arg}" >> "${capture_file}"',
        'done'
      ].join('\n'),
      {encoding: 'utf8', mode: 0o755}
    );

    return {
      tempDir,
      homeDir,
      binDir,
      captureFile
    };
  }

  async function runScript(
    setup: {
      homeDir: string;
      binDir: string;
      captureFile: string;
    },
    extraEnv: Record<string, string>,
    args: string[]
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return await execFileAsync('bash', [scriptPath, ...args], {
      cwd: path.resolve(),
      env: {
        ...process.env,
        ...extraEnv,
        HOME: setup.homeDir,
        PATH: `${setup.binDir}:${process.env.PATH ?? ''}`,
        CODEX_IN_DOCKER_IMAGE: 'ubuntu:24.04',
        DOCKER_ARGS_CAPTURE_FILE: setup.captureFile
      }
    });
  }

  async function readCapturedArgs(captureFile: string): Promise<string[]> {
    const content = await fs.readFile(captureFile, 'utf8');
    return content.split('\n').filter(Boolean);
  }
});
