import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadRuntimeConfig, serializeConfig} from '../src/lib/config.js';
import {loadProjectConfig, loadProjectConfigForRepo} from '../src/lib/project-config.js';
import {writeShrikeInitFiles} from '../src/lib/init/write.js';

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

    const result = await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const runtimeConfig = await loadRuntimeConfig(result.opencodeConfigPath, {
      agent: 'shrike-checker',
      model: 'azure/gpt-5.4-mini'
    });
    const projectConfig = await loadProjectConfig(result.projectConfigPath);
    const readme = await fs.readFile(result.readmePath, 'utf8');
    const gitignore = await fs.readFile(path.join(tempRoot, '.openshrike', '.gitignore'), 'utf8');

    expect(runtimeConfig.config.$schema).toBe('https://opencode.ai/config.json');
    expect(runtimeConfig.config.provider).toBeUndefined();
    expect(runtimeConfig.config.agent?.['shrike-checker']?.model).toBe('azure/gpt-5.4-mini');
    expect(projectConfig.config.scan.defaultKind).toBe('project-checks');
    expect(projectConfig.config.scan.defaultId).toBe('.openshrike/checks');
    expect(projectConfig.config.scan.output).toBe('markdown');
    expect(projectConfig.config.runtime.configPath).toBe('.openshrike/opencode.json');
    expect(projectConfig.config.init.detectedFrom).toEqual(['package.json', 'tsconfig.json']);
    expect(projectConfig.config.init.seedPolicyId).toBe('typescript-baseline');
    expect(result.checksDirectory).toBe(path.join(tempRoot, '.openshrike', 'checks'));
    expect(result.seededCheckPaths.length).toBeGreaterThan(0);
    expect(readme).toContain('`project.json`');
    expect(readme).toContain('`opencode.json`');
    expect(readme).toContain('`checks/`');
    expect(gitignore).toContain('artifacts/');
  });

  it('preserves existing .openshrike/.gitignore entries and adds the artifacts rule', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-'));
    tempDirectories.push(tempRoot);

    const configDirectory = path.join(tempRoot, '.openshrike');
    await fs.mkdir(configDirectory, {recursive: true});
    await fs.writeFile(path.join(configDirectory, '.gitignore'), 'custom-cache/\n', 'utf8');

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const gitignore = await fs.readFile(path.join(configDirectory, '.gitignore'), 'utf8');
    expect(gitignore).toContain('custom-cache/');
    expect(gitignore).toContain('artifacts/');
  });

  it('loads project config from a nested repository path', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-project-config-'));
    tempDirectories.push(tempRoot);

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyId: 'typescript-baseline',
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const nestedPath = path.join(tempRoot, 'src', 'feature');
    await fs.mkdir(nestedPath, {recursive: true});
    const loaded = await loadProjectConfigForRepo(nestedPath);

    expect(loaded?.repoRoot).toBe(tempRoot);
    expect(loaded?.config.scan.defaultId).toBe('.openshrike/checks');
    expect(loaded?.config.init.seedPolicyId).toBe('typescript-baseline');
  });
});
