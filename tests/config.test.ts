import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadRuntimeConfig, serializeConfig} from '../src/lib/config.js';
import {runInitCommand} from '../src/lib/init.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('runtime config', () => {
  it('resolves placeholders and tracks required env vars', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-config-'));
    tempDirectories.push(tempRoot);

    const configPath = path.join(tempRoot, 'opencode.json');
    process.env.TEST_OPENSHRIKE_KEY = 'secret';

    await fs.writeFile(
      configPath,
      `${serializeConfig({
        model: 'azure/gpt-5.4-mini',
        provider: {
          azure: {
            env: ['TEST_OPENSHRIKE_KEY'],
            options: {
              apiKey: '${TEST_OPENSHRIKE_KEY}',
              baseURL: 'https://example.test'
            }
          }
        }
      })}\n`,
      'utf8'
    );

    const loaded = await loadRuntimeConfig(configPath, {
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini'
    });

    expect(loaded.requiredEnvVars).toContain('TEST_OPENSHRIKE_KEY');
    expect(loaded.missingEnvVars).toHaveLength(0);
    expect(loaded.config.provider?.azure?.options?.apiKey).toBe('secret');
  });

  it('normalizes Azure v1 baseURL and apiVersion options', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-config-'));
    tempDirectories.push(tempRoot);

    const configPath = path.join(tempRoot, 'opencode.json');
    await fs.writeFile(
      configPath,
      `${serializeConfig({
        model: 'azure/gpt-5.4-mini',
        provider: {
          azure: {
            options: {
              baseURL: 'https://example-resource.openai.azure.com/',
              queryParams: {
                'api-version': '2025-04-01-preview'
              }
            }
          }
        }
      })}\n`,
      'utf8'
    );

    const loaded = await loadRuntimeConfig(configPath, {
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini'
    });

    expect(loaded.config.provider?.azure?.options?.resourceName).toBe('example-resource');
    expect(loaded.config.provider?.azure?.options?.baseURL).toBeUndefined();
    expect(loaded.config.provider?.azure?.options?.apiVersion).toBeUndefined();
    expect(loaded.config.provider?.azure?.options?.queryParams).toBeUndefined();
    expect(loaded.requiredEnvVars).not.toContain('OPENSHRIKE_AZURE_OPENAI_API_VERSION');
  });

  it('writes init files', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-'));
    tempDirectories.push(tempRoot);

    const result = await runInitCommand({
      cwd: tempRoot,
      force: true
    });

    expect(await fs.readFile(result.configPath, 'utf8')).toContain('"$schema": "https://opencode.ai/config.json"');
    const requiredEnv = await fs.readFile(result.requiredEnvFilePath, 'utf8');
    const envExample = await fs.readFile(result.envExamplePath, 'utf8');

    expect(requiredEnv).toContain('AZURE_OPENAI_API_KEY');
    expect(requiredEnv).toContain('OPENSHRIKE_AZURE_OPENAI_BASE_URL');
    expect(envExample).toContain('AZURE_OPENAI_API_KEY=');
    expect(envExample).toContain('OPENSHRIKE_AZURE_OPENAI_BASE_URL=');
    expect(envExample).not.toContain('OPENSHRIKE_AZURE_OPENAI_API_VERSION=');
  });
});
