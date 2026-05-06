import {spawn} from 'node:child_process';
import path from 'node:path';
import {DEFAULT_RUNTIME_MODE} from './constants.js';
import {listPolicyCatalog} from './policies.js';
import {findToolRoot} from './project-root.js';
import {runInitScreen, InitUiCancelledError, type InitScreenOption} from '../ui/init-app.js';
import type {
  ChangeDefaultsAction,
  ExistingInitAction,
  InitScreen,
  InitWizardContext,
  OpenCodeDiscoveryAction,
  OpenCodeInstallAction,
  SuccessAction
} from './init/state.js';
import {detectProjectType, rankPoliciesForProject} from './init/project-detect.js';
import {discoverExistingInit, discoverOpenCodeSetup, findRepoRoot, getOpenCodeInstallOptions} from './init/discovery.js';
import {writeShrikeInitFiles, type InitWriteResult} from './init/write.js';
import type {RuntimeMode, ShrikeProjectConfig} from './types.js';

export interface InitCommandOptions {
  cwd: string;
  force: boolean;
}

export interface InitResult {
  repoRoot: string;
  action: 'exit' | 'run-scan';
  wroteFiles: boolean;
  projectConfigPath?: string | undefined;
  opencodeConfigPath?: string | undefined;
  readmePath?: string | undefined;
  projectConfig?: ShrikeProjectConfig | undefined;
}

export class InitCommandCancelledError extends Error {
  constructor() {
    super('Init cancelled by user.');
    this.name = 'InitCommandCancelledError';
  }
}

type SelectionFlow = 'initial' | 'change-model' | 'change-policy';

export async function runInitCommand(options: InitCommandOptions): Promise<InitResult> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('`shrike init` requires an interactive terminal.');
  }

  const toolRoot = findToolRoot();
  const context = await buildWizardContext(options, toolRoot);
  let screen: InitScreen = context.existingInit.existingFiles.length > 0 ? 'existing-init' : 'opencode-discovery';
  let selectionFlow: SelectionFlow = 'initial';

  while (true) {
    try {
      switch (screen) {
        case 'existing-init': {
          const selection = await runInitScreen<ExistingInitAction>({
            prompt: 'Project is already initialized',
            bodyLines: [
              'Existing files:',
              ...context.existingInit.existingFiles.map(filePath => `${toRepoRelative(context.repoRoot, filePath)}`),
              '',
              'Current defaults:'
            ],
            summaryItems: [
              {
                label: 'policy',
                value: context.existingProjectConfig?.config.scan.defaultId ?? 'unknown'
              },
              {
                label: 'model',
                value: context.existingProjectConfig?.config.runtime.model ?? 'auto'
              }
            ],
            options: [
              {value: 'update', label: 'Update existing setup'},
              {value: 'replace', label: 'Clear and run setup again'},
              {value: 'exit', label: 'Exit without changes'}
            ],
            initialValue: context.forceReplace ? 'replace' : 'update',
            allowCancel: true
          });

          if (selection.type === 'submit') {
            if (selection.value === 'exit') {
              return buildExitResult(context);
            }

            if (selection.value === 'replace') {
              resetSelections(context, false);
            } else {
              resetSelections(context, true);
            }

            screen = 'opencode-discovery';
          }
          break;
        }

        case 'opencode-discovery': {
          if (context.opencode.status === 'not-installed') {
            screen = 'opencode-install';
            break;
          }

          if (context.opencode.status === 'invalid-config' || context.opencode.status === 'no-models') {
            context.error = {
              title: 'Shrike init',
              prompt: 'OpenCode discovery error',
              lines: buildOpenCodeErrorLines(context),
              retryScreen: 'opencode-discovery',
              backScreen: context.existingInit.existingFiles.length > 0 ? 'existing-init' : 'opencode-discovery',
              retryAction: 'refresh-opencode'
            };
            screen = 'error';
            break;
          }

          const selection = await runInitScreen<OpenCodeDiscoveryAction>({
            prompt: context.opencode.status === 'ready' ? 'OpenCode discovery' : 'OpenCode authentication required',
            bodyLines: buildOpenCodeDiscoveryLines(context),
            summaryItems: buildOpenCodeDiscoverySummary(context),
            options: context.opencode.status === 'ready'
              ? [
                  {value: 'use-discovered', label: 'Use discovered OpenCode config'},
                  {value: 'auth-login', label: 'Re-authenticate with `opencode auth login`'},
                  {value: 'exit', label: 'Exit without changes'}
                ]
              : [
                  {value: 'auth-login', label: 'Launch `opencode auth login`'},
                  {value: 'exit', label: 'Exit without changes'}
                ],
            allowBack: context.existingInit.existingFiles.length > 0,
            allowCancel: true
          });

          if (selection.type === 'back') {
            screen = 'existing-init';
            break;
          }

          if (selection.value === 'exit') {
            return buildExitResult(context);
          }

          if (selection.value === 'auth-login') {
            try {
              await runOpencodeAuthLogin(context);
              await refreshOpenCodeDiscovery(context, toolRoot);
            } catch (error) {
              context.error = {
                title: 'Shrike init',
                prompt: '`opencode auth login` failed',
                lines: [error instanceof Error ? error.message : String(error)],
                retryScreen: 'opencode-discovery',
                backScreen: 'opencode-discovery',
                retryAction: 'auth-login'
              };
              screen = 'error';
              break;
            }

            screen = 'opencode-discovery';
            break;
          }

          if (context.opencode.models.length === 1) {
            context.selections.model = context.opencode.models[0];
            screen = 'policy-selection';
          } else {
            screen = 'model-selection';
          }
          break;
        }

        case 'opencode-install': {
          const installOptions = getOpenCodeInstallOptions();
          const selection = await runInitScreen<OpenCodeInstallAction>({
            prompt: 'OpenCode not found',
            bodyLines: [
              '`opencode` is not available on PATH and no repo-local binary was found.',
              '',
              'Select an install method:'
            ],
            options: installOptions.map(option => ({
              value: option.id,
              label: option.label
            })),
            allowBack: true,
            allowCancel: true
          });

          if (selection.type === 'back' || selection.value === 'back') {
            screen = 'opencode-discovery';
            break;
          }

          const selectedInstall = installOptions.find(option => option.id === selection.value);
          if (!selectedInstall?.command || !selectedInstall.args) {
            screen = 'opencode-discovery';
            break;
          }

          try {
            await runExternalCommand(selectedInstall.command, selectedInstall.args, {
              cwd: context.repoRoot,
              shell: selectedInstall.shell ?? false
            });
            await refreshOpenCodeDiscovery(context, toolRoot);
            screen = context.opencode.status === 'not-installed' ? 'opencode-install' : 'opencode-discovery';
          } catch (error) {
            context.error = {
              title: 'Shrike init',
              prompt: 'OpenCode install failed',
              lines: [error instanceof Error ? error.message : String(error)],
              retryScreen: 'opencode-install',
              backScreen: 'opencode-discovery',
              retryAction: selection.value
            };
            screen = 'error';
          }
          break;
        }

        case 'model-selection': {
          const modelOptions = context.opencode.models.map(model => ({
            value: model,
            label: model
          }));
          const selection = await runInitScreen<string>({
            prompt: 'Select default model',
            bodyLines: [
              'Multiple models were found in your OpenCode config.',
              'Smaller models are fine for local scans, e.g. `gpt-5.4-mini` or a Haiku-class model.'
            ],
            options: modelOptions,
            initialValue: context.selections.model,
            searchable: true,
            searchLabel: 'Search',
            allowBack: true,
            allowCancel: true
          });

          if (selection.type === 'back') {
            screen = selectionFlow === 'change-model' ? 'change-defaults' : 'opencode-discovery';
            break;
          }

          context.selections.model = selection.value;
          if (selectionFlow === 'change-model') {
            await writeSelectionsOrShowError(context, 'success', 'success');
            screen = context.error ? 'error' : 'success';
            selectionFlow = 'initial';
          } else {
            screen = 'policy-selection';
          }
          break;
        }

        case 'policy-selection': {
          const policyOptions = buildPolicyOptions(context);
          const selection = await runInitScreen<string>({
            prompt: 'Select default policy',
            bodyLines: [
              `Detected project type: ${context.projectDetection.recommended.label}`,
              `Evidence: ${context.selections.detectedFrom.join(', ')}`
            ],
            options: policyOptions,
            initialValue: context.selections.policyId,
            searchable: true,
            searchLabel: 'Search',
            noteLines: [
              '',
              'Other defaults are written automatically:',
              `${context.selections.runtimeMode} • uncommitted • auto • json`
            ],
            allowBack: true,
            allowCancel: true
          });

          if (selection.type === 'back') {
            screen = selectionFlow === 'change-policy'
              ? 'change-defaults'
              : context.opencode.models.length > 1
                ? 'model-selection'
                : 'opencode-discovery';
            break;
          }

          context.selections.policyId = selection.value;
          await writeSelectionsOrShowError(context, 'success', 'success');
          screen = context.error ? 'error' : 'success';
          selectionFlow = 'initial';
          break;
        }

        case 'success': {
          const selection = await runInitScreen<SuccessAction>({
            prompt: 'Setup complete',
            bodyLines: ['Repository initialized for Shrike.'],
            summaryItems: [
              {label: 'Provider', value: resolveProviderLabel(context.selections.model, context.opencode.providers)},
              {label: 'Model', value: context.selections.model ?? 'default'},
              {label: 'Default policy', value: context.selections.policyId},
              {label: 'Runtime mode', value: context.selections.runtimeMode}
            ],
            options: [
              {value: 'run-scan', label: 'Run `shrike scan`'},
              {value: 'change-defaults', label: 'Change saved defaults'},
              {value: 'exit', label: 'Exit'}
            ],
            allowCancel: true
          });

          if (selection.type !== 'submit') {
            break;
          }

          if (selection.value === 'run-scan') {
            return buildCompletedResult(context, 'run-scan');
          }

          if (selection.value === 'change-defaults') {
            screen = 'change-defaults';
            break;
          }

          return buildCompletedResult(context, 'exit');
        }

        case 'change-defaults': {
          const options: InitScreenOption<ChangeDefaultsAction>[] = [
            {value: 'policy', label: `Policy: ${context.selections.policyId}`},
            ...(context.opencode.models.length > 1
              ? [{value: 'model' as const, label: `Model: ${context.selections.model ?? 'default'}`}]
              : []),
            {value: 'runtime', label: `Runtime: ${context.selections.runtimeMode}`},
            {value: 'back', label: 'Back'}
          ];

          const selection = await runInitScreen<ChangeDefaultsAction>({
            prompt: 'Change saved defaults',
            options,
            allowBack: true,
            allowCancel: true
          });

          if (selection.type === 'back' || selection.value === 'back') {
            screen = 'success';
            break;
          }

          if (selection.value === 'policy') {
            selectionFlow = 'change-policy';
            screen = 'policy-selection';
            break;
          }

          if (selection.value === 'model') {
            selectionFlow = 'change-model';
            screen = 'model-selection';
            break;
          }

          screen = 'runtime-selection';
          break;
        }

        case 'runtime-selection': {
          const selection = await runInitScreen<RuntimeMode>({
            prompt: 'Select runtime mode',
            bodyLines: ['Choose how `shrike scan` should run by default.'],
            options: [
              {value: 'native', label: 'native'},
              {value: 'docker', label: 'docker'}
            ],
            initialValue: context.selections.runtimeMode,
            allowBack: true,
            allowCancel: true
          });

          if (selection.type === 'back') {
            screen = 'change-defaults';
            break;
          }

          context.selections.runtimeMode = selection.value;
          await writeSelectionsOrShowError(context, 'success', 'success');
          screen = context.error ? 'error' : 'success';
          break;
        }

        case 'error': {
          if (!context.error) {
            screen = 'opencode-discovery';
            break;
          }

          const selection = await runInitScreen<'retry' | 'back' | 'cancel'>({
            prompt: context.error.prompt,
            tone: 'error',
            bodyLines: context.error.lines,
            options: [
              {value: 'retry', label: 'Retry'},
              {value: 'back', label: 'Back'},
              {value: 'cancel', label: 'Cancel'}
            ],
            allowBack: false,
            allowCancel: true
          });

          if (selection.type !== 'submit') {
            break;
          }

          if (selection.value === 'cancel') {
            return buildExitResult(context);
          }

          if (selection.value === 'back') {
            screen = context.error.backScreen;
            context.error = null;
            break;
          }

          const retryAction = context.error.retryAction ?? 'none';
          const retryScreen = context.error.retryScreen;
          context.error = null;
          await handleRetryAction(context, retryAction, toolRoot, retryScreen);
          screen = context.error ? 'error' : retryScreen;
          break;
        }
      }
    } catch (error) {
      if (error instanceof InitUiCancelledError) {
        throw new InitCommandCancelledError();
      }

      throw error;
    }
  }
}

async function buildWizardContext(
  options: InitCommandOptions,
  toolRoot: string
): Promise<InitWizardContext> {
  const repoRoot = await findRepoRoot(options.cwd);
  const existingInit = await discoverExistingInit(repoRoot);
  const existingProjectConfig = existingInit.projectConfig;
  const opencode = await discoverOpenCodeSetup(toolRoot);
  const projectDetection = await detectProjectType(repoRoot);
  const policyCatalog = await listPolicyCatalog();
  const defaultPolicyOrder = rankPoliciesForProject(
    policyCatalog.map(policy => policy.id),
    projectDetection
  );
  const defaultPolicyId = existingProjectConfig?.config.scan.defaultId
    && policyCatalog.some(policy => policy.id === existingProjectConfig.config.scan.defaultId)
    ? existingProjectConfig.config.scan.defaultId
    : defaultPolicyOrder[0] ?? 'shared-foundation';

  return {
    repoRoot,
    existingInit,
    existingProjectConfig,
    opencode,
    projectDetection,
    policyCatalog,
    selections: {
      model: existingProjectConfig?.config.runtime.model
        ?? opencode.defaultModel
        ?? opencode.models[0],
      policyId: defaultPolicyId,
      runtimeMode: existingProjectConfig?.config.runtime.mode ?? DEFAULT_RUNTIME_MODE,
      projectType: existingProjectConfig?.config.init.projectType ?? projectDetection.recommended.projectType,
      detectedFrom: existingProjectConfig?.config.init.detectedFrom?.length
        ? existingProjectConfig.config.init.detectedFrom
        : projectDetection.recommended.evidence,
      opencodeSetup: existingProjectConfig?.config.init.opencodeSetup
        ?? (opencode.status === 'ready' ? 'existing-config' : 'auth-login')
    },
    forceReplace: options.force,
    writeResult: null,
    error: null
  };
}

function resetSelections(context: InitWizardContext, includeExistingDefaults: boolean): void {
  if (includeExistingDefaults && context.existingProjectConfig?.config) {
    context.selections = {
      model: context.existingProjectConfig.config.runtime.model ?? context.opencode.defaultModel ?? context.opencode.models[0],
      policyId: context.existingProjectConfig.config.scan.defaultId,
      runtimeMode: context.existingProjectConfig.config.runtime.mode,
      projectType: context.existingProjectConfig.config.init.projectType,
      detectedFrom: context.existingProjectConfig.config.init.detectedFrom,
      opencodeSetup: context.existingProjectConfig.config.init.opencodeSetup
    };
    return;
  }

  const defaultPolicyOrder = rankPoliciesForProject(
    context.policyCatalog.map(policy => policy.id),
    context.projectDetection
  );

  context.selections = {
    model: context.opencode.defaultModel ?? context.opencode.models[0],
    policyId: defaultPolicyOrder[0] ?? 'shared-foundation',
    runtimeMode: DEFAULT_RUNTIME_MODE,
    projectType: context.projectDetection.recommended.projectType,
    detectedFrom: context.projectDetection.recommended.evidence,
    opencodeSetup: context.opencode.status === 'ready' ? 'existing-config' : 'auth-login'
  };
}

function buildOpenCodeDiscoveryLines(context: InitWizardContext): string[] {
  if (context.opencode.status === 'ready') {
    return [
      `Found existing OpenCode config:`
    ];
  }

  return [
    'OpenCode is installed, but the discovered user config/auth is not ready yet.',
    'Launch `opencode auth login`, then return to this wizard.'
  ];
}

function buildOpenCodeDiscoverySummary(context: InitWizardContext): Array<{label: string; value: string}> {
  return [    
    {
      label: 'default model',
      value: context.opencode.defaultModel ?? 'not set'
    },
    {
      label: 'providers',
      value: context.opencode.providers.length > 0 ? context.opencode.providers.join(', ') : 'none detected'
    },
    {
      label: 'config file',
      value: formatOptionalHomeRelativePath(context.opencode.configPath)
    },
    {
      label: 'auth store',
      value: context.opencode.authPresent
        ? `present${context.opencode.authPath ? ` (${formatOptionalHomeRelativePath(context.opencode.authPath)})` : ''}`
        : 'missing'
    }
  ];
}

function buildOpenCodeErrorLines(context: InitWizardContext): string[] {
  if (context.opencode.status === 'invalid-config') {
    return [
      `Config: ${formatOptionalHomeRelativePath(context.opencode.configPath)}`,
      context.opencode.errorMessage ?? 'Invalid JSON in discovered OpenCode config.'
    ];
  }

  return [
    `Config: ${formatOptionalHomeRelativePath(context.opencode.configPath)}`,
    context.opencode.errorMessage ?? 'No usable provider/model defaults were found.'
  ];
}

function buildPolicyOptions(context: InitWizardContext): InitScreenOption<string>[] {
  const order = rankPoliciesForProject(
    context.policyCatalog.map(policy => policy.id),
    context.projectDetection
  );
  const byId = new Map(context.policyCatalog.map(policy => [policy.id, policy]));

  return order
    .map(policyId => byId.get(policyId))
    .filter((policy): policy is NonNullable<typeof policy> => Boolean(policy))
    .map(policy => ({
      value: policy.id,
      label: policy.id,
      detail: policy.title !== policy.id ? policy.title : undefined,
      searchText: `${policy.id} ${policy.title}`
    }));
}

async function writeSelectionsOrShowError(
  context: InitWizardContext,
  retryScreen: Exclude<InitScreen, 'error'>,
  backScreen: InitScreen
): Promise<void> {
  try {
    context.writeResult = await writeShrikeInitFiles({
      repoRoot: context.repoRoot,
      policyId: context.selections.policyId,
      model: context.selections.model,
      runtimeMode: context.selections.runtimeMode,
      projectType: context.selections.projectType,
      detectedFrom: context.selections.detectedFrom,
      opencodeSetup: context.selections.opencodeSetup
    });
    context.error = null;
  } catch (error) {
    context.error = {
      title: 'Shrike init',
      prompt: 'Failed to write Shrike config',
      lines: [error instanceof Error ? error.message : String(error)],
      retryScreen,
      backScreen,
      retryAction: 'write-files'
    };
  }
}

async function handleRetryAction(
  context: InitWizardContext,
  retryAction: NonNullable<InitWizardContext['error']>['retryAction'],
  toolRoot: string,
  retryScreen: Exclude<InitScreen, 'error'>
): Promise<void> {
  try {
    switch (retryAction) {
      case 'refresh-opencode':
        await refreshOpenCodeDiscovery(context, toolRoot);
        return;
      case 'auth-login':
        await runOpencodeAuthLogin(context);
        await refreshOpenCodeDiscovery(context, toolRoot);
        return;
      case 'install-curl':
      case 'install-npm':
      case 'install-brew': {
        const option = getOpenCodeInstallOptions().find(candidate => candidate.id === retryAction);
        if (option?.command && option.args) {
          await runExternalCommand(option.command, option.args, {
            cwd: context.repoRoot,
            shell: option.shell ?? false
          });
          await refreshOpenCodeDiscovery(context, toolRoot);
        }
        return;
      }
      case 'write-files':
        await writeSelectionsOrShowError(context, retryScreen, retryScreen);
        return;
      case 'none':
      case undefined:
        return;
    }
  } catch (error) {
    context.error = {
      title: 'Shrike init',
      prompt: 'Retry failed',
      lines: [error instanceof Error ? error.message : String(error)],
      retryScreen,
      backScreen: retryScreen,
      ...(retryAction ? {retryAction} : {})
    };
  }
}

async function runOpencodeAuthLogin(context: InitWizardContext): Promise<void> {
  if (!context.opencode.binaryPath) {
    throw new Error('Unable to resolve the `opencode` binary.');
  }

  await runExternalCommand(context.opencode.binaryPath, ['auth', 'login'], {
    cwd: context.repoRoot
  });
}

async function refreshOpenCodeDiscovery(context: InitWizardContext, toolRoot: string): Promise<void> {
  context.opencode = await discoverOpenCodeSetup(toolRoot);
  if (!context.selections.model || !context.opencode.models.includes(context.selections.model)) {
    context.selections.model = context.opencode.defaultModel ?? context.opencode.models[0];
  }
  context.selections.opencodeSetup = context.opencode.status === 'ready' ? 'existing-config' : 'auth-login';
}

async function runExternalCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    shell?: boolean | undefined;
  }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: options.shell ?? false,
      env: process.env
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        signal
          ? `Command exited with signal ${signal}: ${command} ${args.join(' ')}`
          : `Command exited with code ${code}: ${command} ${args.join(' ')}`
      ));
    });
  });
}

function buildExitResult(context: InitWizardContext): InitResult {
  return {
    repoRoot: context.repoRoot,
    action: 'exit',
    wroteFiles: false
  };
}

function buildCompletedResult(context: InitWizardContext, action: 'exit' | 'run-scan'): InitResult {
  const writeResult = context.writeResult;
  if (!writeResult) {
    return {
      repoRoot: context.repoRoot,
      action,
      wroteFiles: false
    };
  }

  return {
    repoRoot: context.repoRoot,
    action,
    wroteFiles: true,
    projectConfigPath: writeResult.projectConfigPath,
    opencodeConfigPath: writeResult.opencodeConfigPath,
    readmePath: writeResult.readmePath,
    projectConfig: writeResult.projectConfig
  };
}

function resolveProviderLabel(model: string | undefined, providers: string[]): string {
  if (model && model.includes('/')) {
    return model.split('/')[0] ?? 'unknown';
  }

  return providers[0] ?? 'unknown';
}

function formatHomeRelativePath(targetPath: string): string {
  const home = path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? '~');
  const absolute = path.resolve(targetPath);
  if (absolute.startsWith(home)) {
    const relative = path.relative(home, absolute);
    return relative ? path.join('~', relative) : '~';
  }

  return absolute;
}

function formatOptionalHomeRelativePath(targetPath: string | null): string {
  return targetPath ? formatHomeRelativePath(targetPath) : 'missing';
}

function toRepoRelative(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath) || '.';
}
