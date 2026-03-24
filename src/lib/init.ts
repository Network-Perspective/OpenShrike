import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AZURE_API_KEY_ENV,
  AZURE_API_VERSION_ENV,
  AZURE_BASE_URL_ENV,
  CONFIG_DIRECTORY_NAME,
  CONFIG_FILE_NAME,
  INIT_README_FILE_NAME,
  REQUIRED_ENV_FILE_NAME,
  RUNTIME_ENV_EXAMPLE_FILE_NAME
} from './constants.js';
import {
  buildDefaultOpencodeConfig,
  getDefaultConfigPath,
  loadRuntimeConfig,
  serializeConfig
} from './config.js';

export interface InitCommandOptions {
  cwd: string;
  force: boolean;
}

export interface InitResult {
  configDirectory: string;
  configPath: string;
  requiredEnvFilePath: string;
  envExamplePath: string;
  readmePath: string;
  requiredEnvVars: string[];
}

export async function runInitCommand(options: InitCommandOptions): Promise<InitResult> {
  const configDirectory = path.join(path.resolve(options.cwd), CONFIG_DIRECTORY_NAME);
  const configPath = path.join(configDirectory, CONFIG_FILE_NAME);
  const requiredEnvFilePath = path.join(configDirectory, REQUIRED_ENV_FILE_NAME);
  const envExamplePath = path.join(configDirectory, RUNTIME_ENV_EXAMPLE_FILE_NAME);
  const readmePath = path.join(configDirectory, INIT_README_FILE_NAME);

  await fs.mkdir(configDirectory, {recursive: true});

  const configAlreadyExists = await exists(configPath);
  const loaded = configAlreadyExists ? await loadRuntimeConfig(configPath).catch(() => null) : null;
  const config = options.force ? buildDefaultOpencodeConfig() : loaded?.config ?? buildDefaultOpencodeConfig();
  const requiredEnvVars = loaded?.requiredEnvVars.length
    ? loaded.requiredEnvVars
    : [AZURE_API_KEY_ENV, AZURE_BASE_URL_ENV, AZURE_API_VERSION_ENV];

  if (!configAlreadyExists || options.force) {
    await fs.writeFile(configPath, `${serializeConfig(config)}\n`, 'utf8');
  }

  await fs.writeFile(requiredEnvFilePath, `${requiredEnvVars.join('\n')}\n`, 'utf8');
  await fs.writeFile(
    envExamplePath,
    [
      '# Copy to .openshrike/runtime.env or pass these variables directly to your container runtime.',
      '# Example: docker run --env-file .openshrike/runtime.env ...',
      '',
      ...requiredEnvVars.map(name => `${name}=`)
    ].join('\n') + '\n',
    'utf8'
  );
  await fs.writeFile(readmePath, buildInitReadme(configPath, requiredEnvFilePath, envExamplePath), 'utf8');

  return {
    configDirectory,
    configPath,
    requiredEnvFilePath,
    envExamplePath,
    readmePath,
    requiredEnvVars
  };
}

export function buildInitReadme(
  configPath = getDefaultConfigPath(),
  requiredEnvFilePath = path.join(CONFIG_DIRECTORY_NAME, REQUIRED_ENV_FILE_NAME),
  envExamplePath = path.join(CONFIG_DIRECTORY_NAME, RUNTIME_ENV_EXAMPLE_FILE_NAME)
): string {
  return [
    '# OpenShrike Runtime Config',
    '',
    `- Main OpenCode config: \`${path.basename(configPath)}\``,
    `- Required container env vars: \`${path.basename(requiredEnvFilePath)}\``,
    `- Example env file: \`${path.basename(envExamplePath)}\``,
    '',
    'The JSON file is regular OpenCode configuration with `${ENV_VAR}` placeholders.',
    'Secrets and environment-specific endpoints stay out of git; pass them in at runtime.',
    'Keep secrets out of the repo by passing them at runtime, for example via `--env-file`.'
  ].join('\n') + '\n';
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
