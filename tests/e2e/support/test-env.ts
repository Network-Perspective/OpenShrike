import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildDefaultOpencodeConfig, serializeConfig} from '../../../src/lib/config.js';
import {
  CONFIG_DIRECTORY_NAME,
  DEFAULT_AGENT_NAME,
  DEFAULT_FIX_AGENT_NAME,
  LAST_SCAN_JSON_FILE_NAME,
  PROJECT_CHECKS_DIRECTORY_NAME
} from '../../../src/lib/constants.js';
import {buildShrikeProjectConfig} from '../../../src/lib/init/write.js';
import {resolveFromToolRoot} from '../../../src/lib/project-root.js';
import {writeProjectConfig} from '../../../src/lib/project-config.js';

export interface Phase1ScanFixture {
  repoRoot: string;
  homeRoot: string;
  checkId: string;
  changedFilePath: string;
  checkDefinition: string;
  commandPath: string;
  env: Record<string, string>;
  tempPaths: string[];
}

export interface Phase3FixFixture {
  repoRoot: string;
  homeRoot: string;
  fakeOpencodeLogPath: string;
  checkId: string;
  changedFilePath: string;
  checkDefinition: string;
  failingSource: string;
  fixedSource: string;
  commandPath: string;
  env: Record<string, string>;
  tempPaths: string[];
}

export interface Phase4InitFixture {
  repoRoot: string;
  homeRoot: string;
  globalOpencodeConfigPath: string;
  globalOpencodeAuthPath: string;
  projectConfigPath: string;
  repoOpencodeConfigPath: string;
  readmePath: string;
  checksDirectory: string;
  selectedScanModel: string;
  selectedFixModel: string;
  expectedPolicyId: string;
  commandPath: string;
  env: Record<string, string>;
  tempPaths: string[];
}

interface FakeOpencodePromptPlan {
  title: string;
  responseText: string;
  promptIncludes?: string[] | undefined;
  mutateFile?: {
    path: string;
    content: string;
  } | undefined;
}

interface FakeOpencodeInstallation {
  binRoot: string;
  logPath: string;
  scenarioPath: string;
  env: Record<string, string>;
}

export async function createPhase1ScanFixture(options: {
  mockProviderBaseUrl: string;
}): Promise<Phase1ScanFixture> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-repo-'));
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-home-'));
  const checkId = 'e2e-scan-001';
  const changedFilePath = 'src/auth.ts';
  const checkDefinition = [
    '# E2E-SCAN-001: Validate auth token export',
    '',
    'Ensure the changed auth module still exports `validateAuthToken` and that',
    'the function returns a boolean value after the current edits.',
    '',
    'If the changed file no longer exports `validateAuthToken`, fail the check.'
  ].join('\n');

  await Promise.all([
    fs.mkdir(path.join(repoRoot, 'src'), {recursive: true}),
    fs.mkdir(path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME), {
      recursive: true
    }),
    fs.mkdir(path.join(homeRoot, '.config'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.local', 'share'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.local', 'state'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.cache'), {recursive: true})
  ]);

  await Promise.all([
    fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
      name: 'openshrike-e2e-fixture',
      private: true,
      type: 'module'
    }, null, 2) + '\n', 'utf8'),
    fs.writeFile(path.join(repoRoot, 'tsconfig.json'), '{\n  "compilerOptions": {}\n}\n', 'utf8'),
    fs.writeFile(
      path.join(repoRoot, changedFilePath),
      [
        'export function validateAuthToken(token: string): boolean {',
        '  return token.length > 0;',
        '}',
        ''
      ].join('\n'),
      'utf8'
    )
  ]);

  const projectConfig = buildShrikeProjectConfig({
    policyIds: ['typescript-baseline'],
    model: 'openai/gpt-4o-mini',
    fixModel: 'openai/gpt-4o-mini',
    runtimeMode: 'native',
    parallelism: 1,
    projectType: 'typescript',
    detectedFrom: ['e2e fixture'],
    opencodeSetup: 'auth-login'
  });
  await writeProjectConfig(path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'project.json'), {
    ...projectConfig,
    runtime: {
      ...projectConfig.runtime,
      scanAgent: DEFAULT_AGENT_NAME,
      scanModel: 'openai/gpt-4o-mini',
      fixAgent: DEFAULT_FIX_AGENT_NAME,
      fixModel: 'openai/gpt-4o-mini',
      parallelism: 1
    },
    scan: {
      ...projectConfig.scan,
      defaultKind: 'project-checks',
      defaultId: path.posix.join(CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME),
      scope: 'uncommitted',
      output: 'markdown',
      ui: true
    }
  });

  const runtimeConfig = buildDefaultOpencodeConfig({
    model: 'openai/gpt-4o-mini',
    fixModel: 'openai/gpt-4o-mini'
  });
  await fs.writeFile(
    path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'opencode.json'),
    `${serializeConfig({
      ...runtimeConfig,
      provider: {
        ...(runtimeConfig.provider ?? {}),
        openai: {
          env: ['OPENAI_API_KEY'],
          options: {
            baseURL: options.mockProviderBaseUrl
          }
        }
      }
    })}\n`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME, `${checkId}.md`),
    `${checkDefinition}\n`,
    'utf8'
  );

  git(repoRoot, ['-c', 'init.defaultBranch=main', 'init']);
  git(repoRoot, ['config', 'user.email', 'openshrike@example.test']);
  git(repoRoot, ['config', 'user.name', 'OpenShrike E2E']);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial fixture']);

  await fs.writeFile(
    path.join(repoRoot, changedFilePath),
    [
      'export function validateAuthToken(token: string): boolean {',
      '  const normalized = token.trim();',
      '  return normalized.length > 0;',
      '}',
      ''
    ].join('\n'),
    'utf8'
  );

  return {
    repoRoot,
    homeRoot,
    checkId,
    changedFilePath,
    checkDefinition,
    commandPath: resolveFromToolRoot('shrike'),
    env: {
      HOME: homeRoot,
      XDG_CONFIG_HOME: path.join(homeRoot, '.config'),
      XDG_DATA_HOME: path.join(homeRoot, '.local', 'share'),
      XDG_STATE_HOME: path.join(homeRoot, '.local', 'state'),
      XDG_CACHE_HOME: path.join(homeRoot, '.cache'),
      OPENAI_API_KEY: 'dummy-openai-key',
      TERM: 'xterm-256color',
      NO_COLOR: '1',
      FORCE_COLOR: '0'
    },
    tempPaths: [repoRoot, homeRoot]
  };
}

export async function createPhase3FixFixture(): Promise<Phase3FixFixture> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-fix-repo-'));
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-fix-home-'));
  const checkId = 'e2e-fix-001';
  const changedFilePath = 'src/auth.ts';
  const checkDefinition = [
    '# E2E-FIX-001: Trim auth token before validation',
    '',
    'Ensure the changed auth module trims the token before validating length.',
    '',
    'If `validateAuthToken` checks length without trimming, fail the check.'
  ].join('\n');
  const failingSource = [
    'export function validateAuthToken(token: string): boolean {',
    '  return token.length > 0;',
    '}',
    ''
  ].join('\n');
  const fixedSource = [
    'export function validateAuthToken(token: string): boolean {',
    '  const normalized = token.trim();',
    '  return normalized.length > 0;',
    '}',
    ''
  ].join('\n');
  const fakeOpencode = await createFakeOpencodeInstallation({
    models: ['openai/gpt-4o-mini'],
    promptPlans: [
      {
        title: `${checkId} fix`,
        promptIncludes: [
          `Check id: ${checkId}`,
          'Latest failed result:',
          'Trim the token before testing its length.'
        ],
        responseText: '',
        mutateFile: {
          path: path.join(repoRoot, changedFilePath),
          content: fixedSource
        }
      },
      {
        title: checkId,
        promptIncludes: [
          `Check id: ${checkId}`,
          'Scoped file allowlist (1):',
          `- ${changedFilePath}`
        ],
        responseText: JSON.stringify({
          id: checkId,
          version: '0.1.0',
          status: 'pass',
          confidence: 'HIGH',
          evidence: [`${changedFilePath}:1`],
          rationale: 'The auth token is trimmed before checking length.',
          remediation: ['No action required.']
        }, null, 2)
      }
    ]
  });

  await Promise.all([
    fs.mkdir(path.join(repoRoot, 'src'), {recursive: true}),
    fs.mkdir(path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME), {
      recursive: true
    }),
    createHomeDirectories(homeRoot)
  ]);

  await Promise.all([
    writePackageJson(repoRoot, 'openshrike-e2e-fix-fixture'),
    fs.writeFile(path.join(repoRoot, 'tsconfig.json'), '{\n  "compilerOptions": {}\n}\n', 'utf8'),
    fs.writeFile(path.join(repoRoot, changedFilePath), failingSource, 'utf8')
  ]);

  const projectConfig = buildShrikeProjectConfig({
    policyIds: ['typescript-baseline'],
    model: 'openai/gpt-4o-mini',
    fixModel: 'openai/gpt-4o-mini',
    runtimeMode: 'native',
    parallelism: 1,
    projectType: 'typescript',
    detectedFrom: ['e2e fix fixture'],
    opencodeSetup: 'auth-login'
  });
  await writeProjectConfig(path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'project.json'), {
    ...projectConfig,
    runtime: {
      ...projectConfig.runtime,
      scanAgent: DEFAULT_AGENT_NAME,
      scanModel: 'openai/gpt-4o-mini',
      fixAgent: DEFAULT_FIX_AGENT_NAME,
      fixModel: 'openai/gpt-4o-mini',
      parallelism: 1
    },
    scan: {
      ...projectConfig.scan,
      defaultKind: 'project-checks',
      defaultId: path.posix.join(CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME),
      scope: 'uncommitted',
      output: 'json',
      ui: false
    }
  });

  const runtimeConfig = buildDefaultOpencodeConfig({
    model: 'openai/gpt-4o-mini',
    fixModel: 'openai/gpt-4o-mini'
  });
  await fs.writeFile(
    path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'opencode.json'),
    `${serializeConfig(runtimeConfig)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME, `${checkId}.md`),
    `${checkDefinition}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(repoRoot, CONFIG_DIRECTORY_NAME, LAST_SCAN_JSON_FILE_NAME),
    `${JSON.stringify({
      version: 1,
      savedAt: '2026-05-18T00:00:00.000Z',
      repo: {
        path: repoRoot,
        head: null,
        dirty: false
      },
      request: {
        checkId: null,
        policyId: null,
        projectChecksDir: path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME),
        scanScope: 'uncommitted',
        scanTarget: null,
        runtimeMode: 'native'
      },
      scope: {
        kind: 'uncommitted',
        label: 'uncommitted changes',
        files: [changedFilePath],
        isFullRepository: false
      },
      report: {
        bundle_id: 'project-checks',
        policy_version: '2026-05-18',
        repo: {
          path: repoRoot
        },
        execution: {
          runtime_mode: 'native',
          requested_parallelism: 1,
          effective_parallelism: 1,
          artifacts_dir: null
        },
        summary: {
          total_checks: 1,
          passed: 0,
          failed: 1,
          unknown: 0
        },
        checks: [
          {
            id: checkId,
            version: '0.1.0',
            status: 'fail',
            confidence: 'HIGH',
            evidence: [`${changedFilePath}:2`],
            rationale: 'Token length is checked without trimming.',
            remediation: ['Trim the token before testing its length.']
          }
        ]
      }
    }, null, 2)}\n`,
    'utf8'
  );

  git(repoRoot, ['-c', 'init.defaultBranch=main', 'init']);
  git(repoRoot, ['config', 'user.email', 'openshrike@example.test']);
  git(repoRoot, ['config', 'user.name', 'OpenShrike E2E']);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial fix fixture']);

  return {
    repoRoot,
    homeRoot,
    fakeOpencodeLogPath: fakeOpencode.logPath,
    checkId,
    changedFilePath,
    checkDefinition,
    failingSource,
    fixedSource,
    commandPath: resolveFromToolRoot('shrike'),
    env: {
      ...buildIsolatedHomeEnv(homeRoot),
      ...fakeOpencode.env,
      TERM: 'xterm-256color',
      NO_COLOR: '1',
      FORCE_COLOR: '0'
    },
    tempPaths: [repoRoot, homeRoot, fakeOpencode.binRoot]
  };
}

export async function createPhase4InitFixture(): Promise<Phase4InitFixture> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-init-repo-'));
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-init-home-'));
  const fakeOpencode = await createFakeOpencodeInstallation({
    models: [
      'azure/gpt-5.4-mini',
      'azure/gpt-5.4',
      'openai/gpt-5.1-mini'
    ]
  });
  const globalOpencodeConfigPath = path.join(homeRoot, '.config', 'opencode', 'opencode.json');
  const globalOpencodeAuthPath = path.join(homeRoot, '.local', 'share', 'opencode', 'auth.json');
  const projectConfigPath = path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'project.json');
  const repoOpencodeConfigPath = path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'opencode.json');
  const readmePath = path.join(repoRoot, CONFIG_DIRECTORY_NAME, 'README.md');
  const checksDirectory = path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME);

  await Promise.all([
    fs.mkdir(path.join(repoRoot, 'src'), {recursive: true}),
    createHomeDirectories(homeRoot),
    fs.mkdir(path.dirname(globalOpencodeConfigPath), {recursive: true}),
    fs.mkdir(path.dirname(globalOpencodeAuthPath), {recursive: true})
  ]);

  await Promise.all([
    writePackageJson(repoRoot, 'openshrike-e2e-init-fixture'),
    fs.writeFile(path.join(repoRoot, 'tsconfig.json'), '{\n  "compilerOptions": {}\n}\n', 'utf8'),
    fs.writeFile(path.join(repoRoot, 'src', 'index.ts'), 'export const ready = true;\n', 'utf8'),
    fs.writeFile(
      globalOpencodeConfigPath,
      `${serializeConfig({
        $schema: 'https://opencode.ai/config.json',
        model: 'azure/gpt-5.4-mini',
        provider: {
          azure: {
            models: {
              'gpt-5.4-mini': {},
              'gpt-5.4': {}
            }
          },
          openai: {
            models: {
              'gpt-5.1-mini': {}
            }
          }
        }
      })}\n`,
      'utf8'
    ),
    fs.writeFile(globalOpencodeAuthPath, '{\n  "token": "fake-auth-token"\n}\n', 'utf8')
  ]);

  git(repoRoot, ['-c', 'init.defaultBranch=main', 'init']);
  git(repoRoot, ['config', 'user.email', 'openshrike@example.test']);
  git(repoRoot, ['config', 'user.name', 'OpenShrike E2E']);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial init fixture']);

  return {
    repoRoot,
    homeRoot,
    globalOpencodeConfigPath,
    globalOpencodeAuthPath,
    projectConfigPath,
    repoOpencodeConfigPath,
    readmePath,
    checksDirectory,
    selectedScanModel: 'azure/gpt-5.4-mini',
    selectedFixModel: 'azure/gpt-5.4',
    expectedPolicyId: 'typescript-baseline',
    commandPath: resolveFromToolRoot('shrike'),
    env: {
      ...buildIsolatedHomeEnv(homeRoot),
      ...fakeOpencode.env,
      TERM: 'xterm-256color',
      NO_COLOR: '1',
      FORCE_COLOR: '0'
    },
    tempPaths: [repoRoot, homeRoot, fakeOpencode.binRoot]
  };
}

export async function removeTempPaths(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(targetPath =>
    fs.rm(targetPath, {recursive: true, force: true})
  ));
}

export function runFixtureGit(repoRoot: string, args: string[]): void {
  git(repoRoot, args);
}

async function createFakeOpencodeInstallation(options: {
  models: string[];
  promptPlans?: FakeOpencodePromptPlan[] | undefined;
}): Promise<FakeOpencodeInstallation> {
  const binRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-e2e-opencode-'));
  const logPath = path.join(binRoot, 'fake-opencode-log.jsonl');
  const scenarioPath = path.join(binRoot, 'fake-opencode-scenario.json');
  const wrapperPath = path.join(binRoot, 'opencode');
  const scriptPath = resolveFromToolRoot('tests', 'e2e', 'support', 'fake-opencode-cli.js');

  await fs.writeFile(
    scenarioPath,
    `${JSON.stringify({
      prompts: options.promptPlans ?? []
    }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    wrapperPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec node ${shellQuote(scriptPath)} "$@"`
    ].join('\n') + '\n',
    'utf8'
  );
  await fs.chmod(wrapperPath, 0o755);

  return {
    binRoot,
    logPath,
    scenarioPath,
    env: {
      PATH: [binRoot, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter),
      FAKE_OPENCODE_LOG_PATH: logPath,
      FAKE_OPENCODE_SCENARIO_PATH: scenarioPath,
      FAKE_OPENCODE_MODELS_JSON: JSON.stringify(options.models)
    }
  };
}

async function createHomeDirectories(homeRoot: string): Promise<void> {
  await Promise.all([
    fs.mkdir(path.join(homeRoot, '.config'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.local', 'share'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.local', 'state'), {recursive: true}),
    fs.mkdir(path.join(homeRoot, '.cache'), {recursive: true})
  ]);
}

async function writePackageJson(repoRoot: string, name: string): Promise<void> {
  await fs.writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({
      name,
      private: true,
      type: 'module'
    }, null, 2) + '\n',
    'utf8'
  );
}

function buildIsolatedHomeEnv(homeRoot: string): Record<string, string> {
  return {
    HOME: homeRoot,
    XDG_CONFIG_HOME: path.join(homeRoot, '.config'),
    XDG_DATA_HOME: path.join(homeRoot, '.local', 'share'),
    XDG_STATE_HOME: path.join(homeRoot, '.local', 'state'),
    XDG_CACHE_HOME: path.join(homeRoot, '.cache')
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function git(repoRoot: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: repoRoot,
    stdio: 'pipe'
  });
}
