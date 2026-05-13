import {spawn} from 'node:child_process';
import path from 'node:path';
import {DEFAULT_OUTPUT, DEFAULT_PARALLELISM, DEFAULT_RUNTIME_MODE} from './constants.js';
import {listPolicyCatalog} from './policies.js';
import {findToolRoot} from './project-root.js';
import {
  createInitUiSession,
  InitUiCancelledError,
  type InitHistoryItem,
  type InitUiSession,
  type InitScreenOption
} from '../ui/init-app.js';
import type {
  ChangeDefaultsAction,
  ExistingInitAction,
  FixModelChoiceAction,
  InitScreen,
  InitWizardContext,
  OpenCodeDiscoveryAction,
  OpenCodeInstallAction,
  SuccessAction
} from './init/state.js';
import {detectProjectType, rankPoliciesForProject} from './init/project-detect.js';
import {discoverExistingInit, discoverOpenCodeSetup, findRepoRoot, getOpenCodeInstallOptions} from './init/discovery.js';
import {writeShrikeInitFiles, type InitWriteResult, type InitWriteScope, type ProjectConfigPatch} from './init/write.js';
import type {ParallelismValue, RuntimeMode, ShrikeProjectConfig} from './types.js';

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

type ModelSelectionFlow = 'initial-scan' | 'initial-fix' | 'change-scan' | 'change-fix';
type SelectionFlow = 'initial' | 'change-policy';
type ChangeDefaultsOrigin = 'success' | 'existing-init';
type WriteSelectionsRequest = {
  scope: InitWriteScope;
  preserveExisting: boolean;
  projectPatch: ProjectConfigPatch;
};

export async function runInitCommand(options: InitCommandOptions): Promise<InitResult> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('`shrike init` requires an interactive terminal.');
  }

  const toolRoot = findToolRoot();
  const context = await buildWizardContext(options, toolRoot);
  let screen: InitScreen = context.existingInit.existingFiles.length > 0 ? 'existing-init' : 'opencode-discovery';
  let selectionFlow: SelectionFlow = 'initial';
  let modelSelectionFlow: ModelSelectionFlow = 'initial-scan';
  let changeDefaultsOrigin: ChangeDefaultsOrigin = 'success';
  const history: InitHistoryItem[] = [];
  const ui = createInitUiSession();

  try {
    while (true) {
      switch (screen) {
        case 'existing-init': {
          const prompt = 'Project is already initialized';
          const optionsForScreen: InitScreenOption<ExistingInitAction>[] = [
            {value: 'update', label: 'Update existing setup'},
            {value: 'replace', label: 'Clear and run setup again'},
            {value: 'exit', label: 'Exit without changes'}
          ];
          const selection = await ui.showScreen<ExistingInitAction>({
            prompt,
            bodyLines: [
              'Existing files:',
              ...context.existingInit.existingFiles.map(filePath => `${toRepoRelative(context.repoRoot, filePath)}`),
              '',
              'Current defaults:'
            ],
            summaryItems: [
              {
                label: 'policy',
                value: resolveSavedPolicyId(
                  context.existingProjectConfig?.config,
                  context.policyCatalog.map(policy => policy.id)
                ) ?? 'unknown'
              },
              {
                label: 'scan model',
                value: context.existingProjectConfig?.config.runtime.scanModel ?? 'auto'
              },
              {
                label: 'fix model',
                value: context.existingProjectConfig?.config.runtime.fixModel
                  ?? context.existingProjectConfig?.config.runtime.scanModel
                  ?? 'auto'
              }
            ],
            options: optionsForScreen,
            initialValue: context.forceReplace ? 'replace' : 'update',
            allowCancel: true
          }, history);

          if (selection.type !== 'submit') {
            break;
          }

          if (selection.value === 'exit') {
            return buildExitResult(context);
          }

          pushSelectedHistory(history, 'existing-init', prompt, optionsForScreen, selection.value);

          if (selection.value === 'update') {
            resetSelections(context, true);
            changeDefaultsOrigin = 'existing-init';
            screen = 'change-defaults';
            break;
          }

          if (selection.value === 'replace') {
            resetSelections(context, false);
          } else {
            resetSelections(context, true);
          }

          screen = 'opencode-discovery';
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

          const prompt = context.opencode.status === 'ready'
            ? 'OpenCode discovery'
            : 'OpenCode authentication required';
          const optionsForScreen: InitScreenOption<OpenCodeDiscoveryAction>[] = context.opencode.status === 'ready'
            ? [
                {value: 'use-discovered', label: 'Continue with discovered OpenCode setup'},
                {value: 'auth-login', label: 'Re-authenticate with `opencode auth login`'},
                {value: 'exit', label: 'Exit without changes'}
              ]
            : [
                {value: 'auth-login', label: 'Launch `opencode auth login`'},
                {value: 'exit', label: 'Exit without changes'}
              ];
          const selection = await ui.showScreen<OpenCodeDiscoveryAction>({
            prompt,
            bodyLines: buildOpenCodeDiscoveryLines(context),
            summaryItems: buildOpenCodeDiscoverySummary(context),
            options: optionsForScreen,
            allowBack: context.existingInit.existingFiles.length > 0,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            popHistoryForScreen(history, 'existing-init');
            screen = 'existing-init';
            break;
          }

          if (selection.value === 'exit') {
            return buildExitResult(context);
          }

          if (selection.value === 'auth-login') {
            try {
              ui.suspend();
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

          pushSelectedHistory(history, 'opencode-discovery', prompt, optionsForScreen, selection.value);

          if (context.opencode.models.length === 1) {
            context.selections.model = context.opencode.models[0];
            context.selections.fixModel = context.opencode.models[0];
            screen = 'policy-selection';
          } else {
            modelSelectionFlow = 'initial-scan';
            screen = 'model-selection';
          }
          break;
        }

        case 'opencode-install': {
          const prompt = 'OpenCode not found';
          const installOptions = getOpenCodeInstallOptions();
          const optionsForScreen: InitScreenOption<OpenCodeInstallAction>[] = installOptions.map(option => ({
            value: option.id,
            label: option.label
          }));
          const selection = await ui.showScreen<OpenCodeInstallAction>({
            prompt,
            bodyLines: [
              '`opencode` is not available on PATH and no repo-local binary was found.',
              '',
              'Select an install method:'
            ],
            options: optionsForScreen,
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back' || selection.value === 'back') {
            popHistoryForScreen(history, 'opencode-discovery');
            screen = 'opencode-discovery';
            break;
          }

          const selectedInstall = installOptions.find(option => option.id === selection.value);
          if (!selectedInstall?.command || !selectedInstall.args) {
            screen = 'opencode-discovery';
            break;
          }

          try {
            ui.suspend();
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
          const selectingFixModel = modelSelectionFlow === 'initial-fix' || modelSelectionFlow === 'change-fix';
          const prompt = selectingFixModel ? 'Select default fix model' : 'Select default scan model';
          const modelOptions = context.opencode.models.map(model => ({
            value: model,
            label: model
          }));
          const selection = await ui.showScreen<string>({
            prompt,
            bodyLines: buildModelSelectionLines(context, selectingFixModel),
            options: modelOptions,
            initialValue: selectingFixModel ? context.selections.fixModel : context.selections.model,
            searchable: true,
            searchLabel: 'Search',
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            const previousScreen = modelSelectionFlow === 'change-scan' || modelSelectionFlow === 'change-fix'
              ? 'change-defaults'
              : modelSelectionFlow === 'initial-fix'
                ? 'fix-model-choice'
                : 'opencode-discovery';
            popHistoryForScreen(history, previousScreen);
            screen = previousScreen;
            break;
          }

          if (selectingFixModel) {
            context.selections.fixModel = selection.value;
          } else {
            context.selections.model = selection.value;
          }

          if (modelSelectionFlow === 'change-scan' || modelSelectionFlow === 'change-fix') {
            await writeSelectionsOrShowError(context, 'change-defaults', 'change-defaults', {
              scope: 'project-and-opencode',
              preserveExisting: true,
              projectPatch: 'model'
            });
            screen = context.error ? 'error' : 'change-defaults';
            selectionFlow = 'initial';
            modelSelectionFlow = 'initial-scan';
          } else {
            pushSelectedHistory(history, 'model-selection', prompt, modelOptions, selection.value);
            screen = selectingFixModel ? 'policy-selection' : 'fix-model-choice';
          }
          break;
        }

        case 'fix-model-choice': {
          const prompt = 'Select default fix model';
          const scanModel = context.selections.model ?? context.opencode.defaultModel ?? context.opencode.models[0] ?? 'default';
          const suggestedFixModel = resolveSuggestedFixModel(context);
          const initialValue = suggestedFixModel !== scanModel ? 'use-suggested' : 'same-as-scan';
          const optionsForScreen: InitScreenOption<FixModelChoiceAction>[] = [
            {
              value: 'use-suggested',
              label: `Suggested: ${suggestedFixModel}`,
              detail: suggestedFixModel === scanModel ? 'Use the same model for scan and fix' : 'Recommended'
            },
            {
              value: 'same-as-scan',
              label: `Same as scan: ${scanModel}`
            },
            {
              value: 'choose-other',
              label: 'Choose another model'
            }
          ];
          const selection = await ui.showScreen<FixModelChoiceAction>({
            prompt,
            bodyLines: buildFixModelChoiceLines(context, suggestedFixModel),
            options: optionsForScreen,
            initialValue,
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            popHistoryForScreen(history, 'model-selection');
            modelSelectionFlow = 'initial-scan';
            screen = 'model-selection';
            break;
          }

          if (selection.value === 'same-as-scan') {
            context.selections.fixModel = context.selections.model;
            pushSelectedHistory(history, 'fix-model-choice', prompt, optionsForScreen, selection.value);
            screen = 'policy-selection';
            break;
          }

          if (selection.value === 'use-suggested') {
            context.selections.fixModel = suggestedFixModel;
            pushSelectedHistory(history, 'fix-model-choice', prompt, optionsForScreen, selection.value);
            screen = 'policy-selection';
            break;
          }

          modelSelectionFlow = 'initial-fix';
          screen = 'model-selection';
          break;
        }

        case 'policy-selection': {
          const prompt = 'Select default policy';
          const policyOptions = buildPolicyOptions(context);
          const selection = await ui.showScreen<string>({
            prompt,
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
              `${context.selections.runtimeMode} • uncommitted • ${formatParallelism(context.selections.parallelism)} • ${DEFAULT_OUTPUT}`
            ],
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            const previousScreen = selectionFlow === 'change-policy'
              ? 'change-defaults'
              : modelSelectionFlow === 'initial-fix'
                ? 'model-selection'
                : context.opencode.models.length > 1
                  ? 'fix-model-choice'
                  : 'opencode-discovery';
            popHistoryForScreen(history, previousScreen);
            screen = previousScreen;
            break;
          }

          context.selections.policyId = selection.value;
          if (selectionFlow === 'change-policy') {
            await writeSelectionsOrShowError(context, 'change-defaults', 'change-defaults', {
              scope: 'project',
              preserveExisting: true,
              projectPatch: 'policy'
            });
            screen = context.error ? 'error' : 'change-defaults';
            selectionFlow = 'initial';
          } else {
            pushSelectedHistory(history, 'policy-selection', prompt, policyOptions, selection.value);
            await writeSelectionsOrShowError(context, 'success', 'success', {
              scope: 'all',
              preserveExisting: false,
              projectPatch: 'full'
            });
            screen = context.error ? 'error' : 'success';
            selectionFlow = 'initial';
            modelSelectionFlow = 'initial-scan';
          }
          break;
        }

        case 'success': {
          const prompt = 'Setup complete';
          const optionsForScreen: InitScreenOption<SuccessAction>[] = [
            {value: 'run-scan', label: 'Run `shrike scan`'},
            {value: 'change-defaults', label: 'Change saved defaults'},
            {value: 'exit', label: 'Exit'}
          ];
          const selection = await ui.showScreen<SuccessAction>({
            prompt,
            bodyLines: ['Repository initialized for Shrike.'],
            summaryItems: [
              {label: 'Scan model', value: context.selections.model ?? 'default'},
              {label: 'Fix model', value: context.selections.fixModel ?? context.selections.model ?? 'default'},
              {label: 'Default policy', value: context.selections.policyId},
              {label: 'Runtime mode', value: context.selections.runtimeMode}
            ],
            options: optionsForScreen,
            allowCancel: true
          }, history);

          if (selection.type !== 'submit') {
            break;
          }

          if (selection.value === 'run-scan') {
            return buildCompletedResult(context, 'run-scan');
          }

          if (selection.value === 'change-defaults') {
            pushSelectedHistory(history, 'success', prompt, optionsForScreen, selection.value);
            changeDefaultsOrigin = 'success';
            screen = 'change-defaults';
            break;
          }

          return buildCompletedResult(context, 'exit');
        }

        case 'change-defaults': {
          const prompt = 'Change saved defaults';
          const optionsForScreen: InitScreenOption<ChangeDefaultsAction>[] = [
            {value: 'policy', label: `Policy: ${context.selections.policyId}`},
            ...(context.opencode.models.length > 1
              ? [
                  {value: 'scan-model' as const, label: `Scan model: ${context.selections.model ?? 'default'}`},
                  {value: 'fix-model' as const, label: `Fix model: ${context.selections.fixModel ?? context.selections.model ?? 'default'}`}
                ]
              : []),
            {value: 'runtime', label: `Runtime: ${context.selections.runtimeMode}`},
            {value: 'parallelism', label: `Parallelism: ${formatParallelism(context.selections.parallelism)}`},
            {value: 'done', label: 'Done'}
          ];

          const selection = await ui.showScreen<ChangeDefaultsAction>({
            prompt,
            options: optionsForScreen,
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            popHistoryForScreen(history, changeDefaultsOrigin);
            screen = changeDefaultsOrigin;
            break;
          }

          if (selection.value === 'done') {
            if (changeDefaultsOrigin === 'success') {
              popHistoryForScreen(history, 'success');
            }
            screen = 'success';
            break;
          }

          if (selection.value === 'policy') {
            selectionFlow = 'change-policy';
            screen = 'policy-selection';
            break;
          }

          if (selection.value === 'scan-model') {
            modelSelectionFlow = 'change-scan';
            screen = 'model-selection';
            break;
          }

          if (selection.value === 'fix-model') {
            modelSelectionFlow = 'change-fix';
            screen = 'model-selection';
            break;
          }

          if (selection.value === 'parallelism') {
            screen = 'parallelism-selection';
            break;
          }

          screen = 'runtime-selection';
          break;
        }

        case 'runtime-selection': {
          const prompt = 'Select runtime mode';
          const optionsForScreen: InitScreenOption<RuntimeMode>[] = [
            {value: 'native', label: 'native'},
            {value: 'docker', label: 'docker'}
          ];
          const selection = await ui.showScreen<RuntimeMode>({
            prompt,
            bodyLines: ['Choose how `shrike scan` should run by default.'],
            options: optionsForScreen,
            initialValue: context.selections.runtimeMode,
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            popHistoryForScreen(history, 'change-defaults');
            screen = 'change-defaults';
            break;
          }

          context.selections.runtimeMode = selection.value;
          await writeSelectionsOrShowError(context, 'change-defaults', 'change-defaults', {
            scope: 'project',
            preserveExisting: true,
            projectPatch: 'runtime'
          });
          screen = context.error ? 'error' : 'change-defaults';
          break;
        }

        case 'parallelism-selection': {
          const prompt = 'Select default parallelism';
          const optionsForScreen = buildParallelismOptions(context.selections.parallelism);
          const selection = await ui.showScreen<string>({
            prompt,
            bodyLines: ['Choose how many checks `shrike scan` should run in parallel by default.'],
            options: optionsForScreen,
            initialValue: formatParallelism(context.selections.parallelism),
            allowBack: true,
            allowCancel: true
          }, history);

          if (selection.type === 'back') {
            popHistoryForScreen(history, 'change-defaults');
            screen = 'change-defaults';
            break;
          }

          context.selections.parallelism = parseParallelism(selection.value);
          await writeSelectionsOrShowError(context, 'change-defaults', 'change-defaults', {
            scope: 'project',
            preserveExisting: true,
            projectPatch: 'parallelism'
          });
          screen = context.error ? 'error' : 'change-defaults';
          break;
        }

        case 'error': {
          if (!context.error) {
            screen = 'opencode-discovery';
            break;
          }

          const selection = await ui.showScreen<'retry' | 'back' | 'cancel'>({
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
          }, history);

          if (selection.type !== 'submit') {
            break;
          }

          if (selection.value === 'cancel') {
            return buildExitResult(context);
          }

          if (selection.value === 'back') {
            popHistoryForScreen(history, context.error.backScreen);
            screen = context.error.backScreen;
            context.error = null;
            break;
          }

          const retryAction = context.error.retryAction ?? 'none';
          const retryScreen = context.error.retryScreen;
          context.error = null;
          await handleRetryAction(context, retryAction, toolRoot, retryScreen, ui);
          screen = context.error ? 'error' : retryScreen;
          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof InitUiCancelledError) {
      throw new InitCommandCancelledError();
    }

    throw error;
  } finally {
    ui.close();
  }
}

async function buildWizardContext(
  options: InitCommandOptions,
  toolRoot: string
): Promise<InitWizardContext> {
  const repoRoot = await findRepoRoot(options.cwd);
  const existingInit = await discoverExistingInit(repoRoot);
  const existingProjectConfig = existingInit.projectConfig;
  const opencode = await discoverOpenCodeSetup(toolRoot, repoRoot);
  const projectDetection = await detectProjectType(repoRoot);
  const policyCatalog = await listPolicyCatalog();
  const defaultPolicyOrder = rankPoliciesForProject(
    policyCatalog.map(policy => policy.id),
    projectDetection
  );
  const defaultPolicyId = resolveSavedPolicyId(
    existingProjectConfig?.config,
    policyCatalog.map(policy => policy.id)
  ) ?? defaultPolicyOrder[0] ?? 'shared-foundation';

  return {
    repoRoot,
    existingInit,
    existingProjectConfig,
    opencode,
    projectDetection,
    policyCatalog,
    selections: {
      model: existingProjectConfig?.config.runtime.scanModel
        ?? opencode.defaultModel
        ?? opencode.models[0],
      fixModel: existingProjectConfig?.config.runtime.fixModel
        ?? existingProjectConfig?.config.runtime.scanModel
        ?? resolveSuggestedFixModelFromModels(
          existingProjectConfig?.config.runtime.scanModel ?? opencode.defaultModel ?? opencode.models[0],
          opencode.models
        ),
      policyId: defaultPolicyId,
      runtimeMode: existingProjectConfig?.config.runtime.mode ?? DEFAULT_RUNTIME_MODE,
      parallelism: existingProjectConfig?.config.runtime.parallelism ?? DEFAULT_PARALLELISM,
      projectType: existingProjectConfig?.config.init.projectType ?? projectDetection.recommended.projectType,
      detectedFrom: existingProjectConfig?.config.init.detectedFrom?.length
        ? existingProjectConfig.config.init.detectedFrom
        : projectDetection.recommended.evidence,
      opencodeSetup: existingProjectConfig?.config.init.opencodeSetup
        ?? resolveDiscoveredOpenCodeSetup(opencode)
    },
    forceReplace: options.force,
    writeResult: null,
    lastWriteRequest: null,
    error: null
  };
}

function resetSelections(context: InitWizardContext, includeExistingDefaults: boolean): void {
  const defaultPolicyOrder = rankPoliciesForProject(
    context.policyCatalog.map(policy => policy.id),
    context.projectDetection
  );
  const fallbackPolicyId = defaultPolicyOrder[0] ?? 'shared-foundation';

  if (includeExistingDefaults && context.existingProjectConfig?.config) {
    context.selections = {
      model: context.existingProjectConfig.config.runtime.scanModel ?? context.opencode.defaultModel ?? context.opencode.models[0],
      fixModel: context.existingProjectConfig.config.runtime.fixModel
        ?? context.existingProjectConfig.config.runtime.scanModel
        ?? resolveSuggestedFixModelFromModels(
          context.existingProjectConfig.config.runtime.scanModel ?? context.opencode.defaultModel ?? context.opencode.models[0],
          context.opencode.models
        ),
      policyId: resolveSavedPolicyId(
        context.existingProjectConfig.config,
        context.policyCatalog.map(policy => policy.id)
      ) ?? fallbackPolicyId,
      runtimeMode: context.existingProjectConfig.config.runtime.mode,
      parallelism: context.existingProjectConfig.config.runtime.parallelism,
      projectType: context.existingProjectConfig.config.init.projectType,
      detectedFrom: context.existingProjectConfig.config.init.detectedFrom,
      opencodeSetup: context.existingProjectConfig.config.init.opencodeSetup
    };
    return;
  }

  context.selections = {
    model: context.opencode.defaultModel ?? context.opencode.models[0],
    fixModel: resolveSuggestedFixModelFromModels(
      context.opencode.defaultModel ?? context.opencode.models[0],
      context.opencode.models
    ),
    policyId: fallbackPolicyId,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    parallelism: DEFAULT_PARALLELISM,
    projectType: context.projectDetection.recommended.projectType,
    detectedFrom: context.projectDetection.recommended.evidence,
    opencodeSetup: resolveDiscoveredOpenCodeSetup(context.opencode)
  };
}

function buildOpenCodeDiscoveryLines(context: InitWizardContext): string[] {
  if (context.opencode.status === 'ready') {
    if (!context.opencode.configPath) {
      return [
        'OpenCode credentials are ready. No user-global OpenCode config was found.',
        'Choose a model here and Shrike will save it in `.openshrike/opencode.json` for native scans.'
      ];
    }

    return [
      `Found existing OpenCode config:`
    ];
  }

  if (!context.opencode.configPath) {
    return [
      'OpenCode is installed, but credentials are not ready yet.',
      'Launch `opencode auth login`; Shrike will list models afterward and save the selected one in `.openshrike/opencode.json`.'
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

function buildParallelismOptions(current: ParallelismValue): InitScreenOption<string>[] {
  const seen = new Set<string>();
  const values = [
    formatParallelism(current),
    'auto',
    '1',
    '2',
    '4',
    '8'
  ].filter(value => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });

  return values.map(value => ({
    value,
    label: value,
    detail: value === 'auto'
      ? 'scale automatically'
      : value === '1'
        ? 'run checks sequentially'
        : `run up to ${value} checks at once`
  }));
}

function parseParallelism(value: string): ParallelismValue {
  return value === 'auto' ? 'auto' : Number.parseInt(value, 10);
}

function formatParallelism(value: ParallelismValue): string {
  return String(value);
}

function pushSelectedHistory<T extends string>(
  history: InitHistoryItem[],
  screen: string,
  prompt: string,
  options: InitScreenOption<T>[],
  value: T
): void {
  history.push({
    screen,
    prompt,
    responseLines: [resolveOptionLabel(options, value)]
  });
}

function popHistoryForScreen(history: InitHistoryItem[], screen: string): void {
  if (history.at(-1)?.screen === screen) {
    history.pop();
  }
}

function resolveOptionLabel<T extends string>(options: InitScreenOption<T>[], value: T): string {
  return options.find(option => option.value === value)?.label ?? value;
}

function resolveSavedPolicyId(
  config: ShrikeProjectConfig | null | undefined,
  availablePolicyIds: string[]
): string | null {
  const candidate = config?.init.seedPolicyId
    ?? (config?.scan.defaultKind === 'policy' ? config.scan.defaultId : undefined);

  if (!candidate) {
    return null;
  }

  return availablePolicyIds.includes(candidate) ? candidate : null;
}

async function writeSelectionsOrShowError(
  context: InitWizardContext,
  retryScreen: Exclude<InitScreen, 'error'>,
  backScreen: InitScreen,
  request: WriteSelectionsRequest
): Promise<void> {
  context.lastWriteRequest = request;

  try {
    context.writeResult = await writeShrikeInitFiles({
      repoRoot: context.repoRoot,
      policyId: context.selections.policyId,
      model: context.selections.model,
      fixModel: context.selections.fixModel,
      runtimeMode: context.selections.runtimeMode,
      parallelism: context.selections.parallelism,
      projectType: context.selections.projectType,
      detectedFrom: context.selections.detectedFrom,
      opencodeSetup: context.selections.opencodeSetup,
      scope: request.scope,
      preserveExisting: request.preserveExisting,
      projectPatch: request.projectPatch
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
  retryScreen: Exclude<InitScreen, 'error'>,
  ui: InitUiSession
): Promise<void> {
  try {
    switch (retryAction) {
      case 'refresh-opencode':
        await refreshOpenCodeDiscovery(context, toolRoot);
        return;
      case 'auth-login':
        ui.suspend();
        await runOpencodeAuthLogin(context);
        await refreshOpenCodeDiscovery(context, toolRoot);
        return;
      case 'install-curl':
      case 'install-npm':
      case 'install-brew': {
        const option = getOpenCodeInstallOptions().find(candidate => candidate.id === retryAction);
        if (option?.command && option.args) {
          ui.suspend();
          await runExternalCommand(option.command, option.args, {
            cwd: context.repoRoot,
            shell: option.shell ?? false
          });
          await refreshOpenCodeDiscovery(context, toolRoot);
        }
        return;
      }
      case 'write-files':
        if (context.lastWriteRequest) {
          await writeSelectionsOrShowError(context, retryScreen, retryScreen, context.lastWriteRequest);
        }
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
  context.opencode = await discoverOpenCodeSetup(toolRoot, context.repoRoot);
  if (!context.selections.model || !context.opencode.models.includes(context.selections.model)) {
    context.selections.model = context.opencode.defaultModel ?? context.opencode.models[0];
  }
  if (!context.selections.fixModel || !context.opencode.models.includes(context.selections.fixModel)) {
    context.selections.fixModel = resolveSuggestedFixModel(context);
  }
  context.selections.opencodeSetup = resolveDiscoveredOpenCodeSetup(context.opencode);
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

function buildModelSelectionLines(context: InitWizardContext, selectingFixModel: boolean): string[] {
  if (!context.opencode.configPath) {
    return [
      'No global OpenCode config was found. Shrike will save the selected model in `.openshrike/opencode.json`.',
      selectingFixModel
        ? 'Pick the model Shrike should use for fixes. A stronger model is often better for code changes.'
        : 'Smaller models are fine for local scans, e.g. `gpt-5.4-mini` or a Haiku-class model.'
    ];
  }

  return [
    selectingFixModel
      ? 'Choose the model Shrike should use for fixes.'
      : 'Choose the model Shrike should use for scans.',
    selectingFixModel
      ? 'A stronger model is often better for fixes than for scans.'
      : 'Smaller models are fine for local scans, e.g. `gpt-5.4-mini` or a Haiku-class model.'
  ];
}

function buildFixModelChoiceLines(context: InitWizardContext, suggestedFixModel: string): string[] {
  const scanModel = context.selections.model ?? 'default';
  return [
    `Scan model: ${scanModel}`,
    `Suggested fix model: ${suggestedFixModel}`,
    'Fixes may benefit from a stronger model, but you can keep the same default if you prefer.'
  ];
}

function resolveSuggestedFixModel(context: Pick<InitWizardContext, 'opencode' | 'selections'>): string {
  return resolveSuggestedFixModelFromModels(context.selections.model, context.opencode.models);
}

function resolveSuggestedFixModelFromModels(
  scanModel: string | undefined,
  availableModels: string[]
): string {
  if (!scanModel) {
    return availableModels[0] ?? 'default';
  }

  if (availableModels.includes('azure/gpt-5.4')) {
    return 'azure/gpt-5.4';
  }

  if (availableModels.includes('openai/gpt-5.1')) {
    return 'openai/gpt-5.1';
  }

  const preferredSibling = scanModel
    .replace(/-mini$/i, '')
    .replace(/-nano$/i, '')
    .replace(/-haiku$/i, '-sonnet');
  if (preferredSibling !== scanModel && availableModels.includes(preferredSibling)) {
    return preferredSibling;
  }

  return availableModels.find(model => isStrongerModel(model, scanModel))
    ?? scanModel;
}

function isStrongerModel(candidate: string, scanModel: string): boolean {
  if (candidate === scanModel) {
    return false;
  }

  const lightweightTokens = ['mini', 'nano', 'haiku'];
  const candidateIsLight = lightweightTokens.some(token => candidate.toLowerCase().includes(token));
  const scanIsLight = lightweightTokens.some(token => scanModel.toLowerCase().includes(token));
  if (scanIsLight && !candidateIsLight) {
    return true;
  }

  return false;
}

function resolveDiscoveredOpenCodeSetup(
  opencode: InitWizardContext['opencode']
): 'existing-config' | 'auth-login' {
  return opencode.status === 'ready' && opencode.configPath ? 'existing-config' : 'auth-login';
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
