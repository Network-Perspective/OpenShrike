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

  it('resolves OpenCode env placeholders and tracks required env vars', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-config-'));
    tempDirectories.push(tempRoot);

    const configPath = path.join(tempRoot, 'opencode.json');
    process.env.TEST_OPENSHRIKE_KEY = 'secret';
    process.env.TEST_OPENSHRIKE_RESOURCE = 'example-resource';

    await fs.writeFile(
      configPath,
      `${serializeConfig({
        model: 'azure/gpt-5.4-mini',
        provider: {
          azure: {
            options: {
              apiKey: '{env:TEST_OPENSHRIKE_KEY}',
              resourceName: '{env:TEST_OPENSHRIKE_RESOURCE}'
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

    expect(loaded.requiredEnvVars).toEqual(['TEST_OPENSHRIKE_KEY', 'TEST_OPENSHRIKE_RESOURCE']);
    expect(loaded.missingEnvVars).toHaveLength(0);
    expect(loaded.config.provider?.azure?.options?.apiKey).toBe('secret');
    expect(loaded.config.provider?.azure?.options?.resourceName).toBe('example-resource');
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
      policyIds: ['typescript-baseline'],
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
    expect(projectConfig.config.runtime.scanAgent).toBe('shrike-checker');
    expect(projectConfig.config.runtime.scanModel).toBe('azure/gpt-5.4-mini');
    expect(projectConfig.config.runtime.fixAgent).toBe('shrike-fixer');
    expect(projectConfig.config.runtime.fixModel).toBe('azure/gpt-5.4-mini');
    expect(projectConfig.config.init.detectedFrom).toEqual(['package.json', 'tsconfig.json']);
    expect(projectConfig.config.init.seedPolicyId).toBe('typescript-baseline');
    expect(projectConfig.config.init.seedPolicyIds).toEqual(['typescript-baseline']);
    expect(result.checksDirectory).toBe(path.join(tempRoot, '.openshrike', 'checks'));
    expect(result.seededCheckPaths.length).toBeGreaterThan(0);
    expect(readme).toContain('`project.json`');
    expect(readme).toContain('`opencode.json`');
    expect(readme).toContain('`checks/`');
    expect(gitignore).toContain('artifacts/');
    expect(gitignore).toContain('last-scan.json');
    expect(gitignore).toContain('last-scan.md');
  });

  it('seeds the union of checks from all selected policies', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-multi-policy-'));
    tempDirectories.push(tempRoot);

    const result = await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline', 'python-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    const projectConfig = await loadProjectConfig(result.projectConfigPath);
    const seededCheckFiles = await fs.readdir(result.checksDirectory);

    expect(projectConfig.config.init.seedPolicyId).toBe('typescript-baseline');
    expect(projectConfig.config.init.seedPolicyIds).toEqual([
      'typescript-baseline',
      'python-baseline'
    ]);
    expect(seededCheckFiles).toContain('typescript-api-001-public-boundary-types-avoid-any.md');
    expect(seededCheckFiles).toContain('python-rel-001-http-clients-have-timeouts.md');
    expect(result.seededCheckPaths.filter(filePath => filePath.endsWith('bp-api-001-machine-readable-errors.md'))).toHaveLength(1);
  });

  it('preserves existing .openshrike/.gitignore entries and adds the artifacts rule', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-'));
    tempDirectories.push(tempRoot);

    const configDirectory = path.join(tempRoot, '.openshrike');
    await fs.mkdir(configDirectory, {recursive: true});
    await fs.writeFile(path.join(configDirectory, '.gitignore'), 'custom-cache/\n', 'utf8');

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
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

  it('preserves existing config on project-only updates', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-preserve-'));
    tempDirectories.push(tempRoot);

    const result = await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });
    const originalOpencodeConfig = `${serializeConfig({
      model: 'azure/gpt-5.4-mini',
      provider: {
        azure: {
          options: {
            resourceName: 'custom-resource'
          }
        }
      },
      agent: {
        'shrike-checker': {
          description: 'Custom Shrike agent',
          model: 'azure/gpt-5.4-mini'
        }
      }
    })}\n`;

    await fs.writeFile(
      result.projectConfigPath,
      `${JSON.stringify({
        $schema: 'https://openshrike.dev/schema/project.json',
        version: 1,
        init: {
          projectType: 'typescript',
          detectedFrom: ['package.json'],
          opencodeSetup: 'existing-config',
          customEvidence: true
        },
        runtime: {
          configPath: '.openshrike/opencode.json',
          agent: 'shrike-checker',
          model: 'azure/gpt-5.4-mini',
          mode: 'native',
          parallelism: 'auto',
          dockerImage: 'custom-image'
        },
        scan: {
          defaultKind: 'policy',
          defaultId: 'typescript-baseline',
          repo: '.',
          scope: 'uncommitted',
          output: 'markdown',
          ui: true,
          artifactsDir: null,
          labels: ['keep-me']
        },
        customTopLevel: {
          owner: 'user'
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(result.opencodeConfigPath, originalOpencodeConfig, 'utf8');

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'docker',
      parallelism: 4,
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config',
      scope: 'project',
      preserveExisting: true
    });

    const rawProjectConfig = JSON.parse(await fs.readFile(result.projectConfigPath, 'utf8')) as Record<string, any>;

    expect(rawProjectConfig.runtime.mode).toBe('docker');
    expect(rawProjectConfig.runtime.parallelism).toBe(4);
    expect(rawProjectConfig.runtime.dockerImage).toBe('custom-image');
    expect(rawProjectConfig.scan.labels).toEqual(['keep-me']);
    expect(rawProjectConfig.init.customEvidence).toBe(true);
    expect(rawProjectConfig.customTopLevel).toEqual({owner: 'user'});
    expect(await fs.readFile(result.opencodeConfigPath, 'utf8')).toBe(originalOpencodeConfig);
  });

  it('merges existing opencode config when updating the saved model', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-init-merge-opencode-'));
    tempDirectories.push(tempRoot);

    const result = await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4-mini',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config'
    });

    await fs.writeFile(
      result.opencodeConfigPath,
      `${serializeConfig({
        model: 'azure/gpt-5.4-mini',
        permission: {
          bash: 'ask',
          edit: 'deny'
        },
        provider: {
          azure: {
            env: ['AZURE_OPENAI_API_KEY'],
            options: {
              resourceName: 'custom-resource'
            }
          }
        },
        agent: {
          'shrike-checker': {
            description: 'Custom Shrike agent',
            model: 'azure/gpt-5.4-mini',
            permission: {
              bash: 'ask'
            },
            extraSetting: true
          },
          reviewer: {
            model: 'azure/gpt-5.4'
          }
        }
      })}\n`,
      'utf8'
    );

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
      model: 'azure/gpt-5.4',
      runtimeMode: 'native',
      projectType: 'typescript',
      detectedFrom: ['package.json', 'tsconfig.json'],
      opencodeSetup: 'existing-config',
      scope: 'project-and-opencode',
      preserveExisting: true
    });

    const rawRuntimeConfig = JSON.parse(await fs.readFile(result.opencodeConfigPath, 'utf8')) as Record<string, any>;
    const projectConfig = await loadProjectConfig(result.projectConfigPath);

    expect(rawRuntimeConfig.model).toBe('azure/gpt-5.4');
    expect(rawRuntimeConfig.provider.azure.options.resourceName).toBe('custom-resource');
    expect(rawRuntimeConfig.permission.bash).toBe('ask');
    expect(rawRuntimeConfig.agent.reviewer.model).toBe('azure/gpt-5.4');
    expect(rawRuntimeConfig.agent['shrike-checker'].description).toBe('Custom Shrike agent');
    expect(rawRuntimeConfig.agent['shrike-checker'].permission.bash).toBe('ask');
    expect(rawRuntimeConfig.agent['shrike-checker'].extraSetting).toBe(true);
    expect(rawRuntimeConfig.agent['shrike-checker'].model).toBe('azure/gpt-5.4');
    expect(projectConfig.config.runtime.scanModel).toBe('azure/gpt-5.4');
    expect(projectConfig.config.runtime.fixModel).toBe('azure/gpt-5.4');
  });

  it('loads project config from a nested repository path', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-project-config-'));
    tempDirectories.push(tempRoot);

    await writeShrikeInitFiles({
      repoRoot: tempRoot,
      policyIds: ['typescript-baseline'],
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
    expect(loaded?.config.init.seedPolicyIds).toEqual(['typescript-baseline']);
  });
});
