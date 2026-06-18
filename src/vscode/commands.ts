import * as vscode from 'vscode';
import path from 'node:path';
import {loadProjectConfigForRepo} from '../lib/project-config.js';
import {parseEvidenceLocation} from '../lib/evidence.js';
import type {RuntimeMode, ScanCommandOptions} from '../lib/types.js';
import type {OpenShrikeExtensionModel} from './extension-model.js';
import {
  isInitEnvironmentReady,
  SHRIKE_CLI_INSTALL_COMMAND,
  type InitEnvironmentState
} from './init-environment-state.js';
import type {OpenShrikeInitEnvironmentMonitor} from './init-environment.js';
import type {OpenShrikeOutputChannel} from './output-channel.js';
import type {OpenShrikeScanController} from './scan-controller.js';
import {
  promptForRuntimeModeSelection,
  promptForScanOverrides,
  promptForScanScopeSelection
} from './scan-overrides.js';
import type {OpenShrikeDetailPanel} from './views/detail-panel.js';
import {resolveWorkspaceTargetForCommand} from './workspace-target.js';

export function registerExtensionCommands(
  context: vscode.ExtensionContext,
  dependencies: {
    model: OpenShrikeExtensionModel;
    output: OpenShrikeOutputChannel;
    detailPanel: OpenShrikeDetailPanel;
    controller: OpenShrikeScanController;
    initEnvironmentMonitor: OpenShrikeInitEnvironmentMonitor;
  }
): void {
  const register = (command: string, callback: () => unknown | Thenable<unknown>) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register('openshrike.runScan', async () => {
    const workspace = await resolveWorkspaceTargetForCommand();
    if (!workspace) {
      return vscode.window.showWarningMessage('Open a workspace folder before running OpenShrike scans.');
    }

    if (!await ensureWorkspaceInitialized(workspace.path, dependencies.initEnvironmentMonitor)) {
      return undefined;
    }

    return await runLongOperation('OpenShrike Scan', dependencies, async () => {
      await dependencies.controller.runScan(workspace);
      return await revealSelectionAfterDataLoad(dependencies.model, dependencies.detailPanel);
    }, {
      cancellable: true
    });
  });
  context.subscriptions.push(vscode.commands.registerCommand('openshrike.runScanWithOverrides', async (providedOverrides?: unknown) => {
    const workspace = await resolveWorkspaceTargetForCommand();
    if (!workspace) {
      return vscode.window.showWarningMessage('Open a workspace folder before running OpenShrike scans.');
    }

    if (!await ensureWorkspaceInitialized(workspace.path, dependencies.initEnvironmentMonitor)) {
      return undefined;
    }

    const overrides = isScanOverridesInput(providedOverrides)
      ? providedOverrides
      : await promptForScanOverrides(workspace.path);
    if (!overrides) {
      return undefined;
    }

    return await runLongOperation('OpenShrike Scan', dependencies, async () => {
      await dependencies.controller.runScan(workspace, overrides);
      return await revealSelectionAfterDataLoad(dependencies.model, dependencies.detailPanel);
    }, {
      cancellable: true
    });
  }));
  context.subscriptions.push(vscode.commands.registerCommand('openshrike.runScanWithScopeOverride', async (providedSelection?: unknown) => {
    const workspace = await resolveWorkspaceTargetForCommand();
    if (!workspace) {
      return vscode.window.showWarningMessage('Open a workspace folder before running OpenShrike scans.');
    }

    if (!await ensureWorkspaceInitialized(workspace.path, dependencies.initEnvironmentMonitor)) {
      return undefined;
    }

    const selection = coerceScopeSelectionInput(providedSelection)
      ?? await promptForScanScopeSelection(workspace.path);
    if (!selection) {
      return undefined;
    }

    await dependencies.controller.setScopeSelection(workspace, {
      scanScope: selection.scanScope,
      scanTarget: selection.scanTarget ?? null
    });
    return undefined;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('openshrike.runScanWithRuntimeOverride', async (providedOverrides?: unknown) => {
    const workspace = await resolveWorkspaceTargetForCommand();
    if (!workspace) {
      return vscode.window.showWarningMessage('Open a workspace folder before running OpenShrike scans.');
    }

    if (!await ensureWorkspaceInitialized(workspace.path, dependencies.initEnvironmentMonitor)) {
      return undefined;
    }

    const runtimeMode = coerceRuntimeModeInput(providedOverrides)
      ?? await promptForRuntimeModeSelection();
    if (!runtimeMode) {
      return undefined;
    }

    await dependencies.controller.setRuntimeMode(workspace, runtimeMode);
    return undefined;
  }));
  register('openshrike.cancelScan', async () => {
    const cancelled = await dependencies.controller.cancelScan();
    if (!cancelled) {
      return vscode.window.showInformationMessage('There is no active OpenShrike scan to cancel.');
    }

    return undefined;
  });
  register('openshrike.loadLastScan', async () => {
    const workspace = await resolveWorkspaceTargetForCommand();
    if (!workspace) {
      return vscode.window.showWarningMessage('Open a workspace folder before loading OpenShrike scan results.');
    }

    if (!await ensureWorkspaceInitialized(workspace.path, dependencies.initEnvironmentMonitor)) {
      return undefined;
    }

    return await runLongOperation('Load OpenShrike Last Scan', dependencies, async () => {
      await dependencies.controller.loadLastScan(workspace);
      return await revealSelectionAfterDataLoad(dependencies.model, dependencies.detailPanel);
    });
  });
  register('openshrike.openLastScan', () => openWorkspaceFile(
    resolveLastScanPath(dependencies.model),
    undefined,
    dependencies.model.getState().workspacePath
  ));
  register('openshrike.editFinding', () => openSelectedSource(dependencies.model));
  register('openshrike.recheckFinding', () => runFindingAction('Recheck Finding', dependencies, async () => {
    await dependencies.controller.recheckSelectedFinding();
    return await revealSelectionAfterDataLoad(dependencies.model, dependencies.detailPanel);
  }));
  register('openshrike.fixFinding', () => runFindingAction('Fix Finding', dependencies, async () => {
    await dependencies.controller.fixSelectedFinding();
    return await revealSelectionAfterDataLoad(dependencies.model, dependencies.detailPanel);
  }));
  register('openshrike.sortChecksById', () => {
    dependencies.model.setSortMode('id');
  });
  register('openshrike.sortChecksByStatus', () => {
    dependencies.model.setSortMode('status');
  });
  register('openshrike.sortChecksByName', () => {
    dependencies.model.setSortMode('name');
  });
  register('openshrike.showOutput', () => {
    dependencies.output.show();
  });
  register('openshrike.openCheckMarkdown', () => openSelectedCheckMarkdown(dependencies.model));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.runInitInTerminal', (workspacePath?: unknown) => {
    return runInitInTerminal({
      initEnvironmentMonitor: dependencies.initEnvironmentMonitor,
      ...(typeof workspacePath === 'string' ? {workspacePath} : {})
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.installShrikeCli', (workspacePath?: unknown) => {
    return installShrikeCli({
      initEnvironmentMonitor: dependencies.initEnvironmentMonitor,
      ...(typeof workspacePath === 'string' ? {workspacePath} : {})
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.refreshInitialization', (workspacePath?: unknown) => {
    return refreshInitializationState({
      model: dependencies.model,
      controller: dependencies.controller,
      initEnvironmentMonitor: dependencies.initEnvironmentMonitor,
      ...(typeof workspacePath === 'string' ? {workspacePath} : {})
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.openNodeInstallPage', async () => {
    await vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/en/download'));
    dependencies.initEnvironmentMonitor.scheduleRefresh(dependencies.model.getState().workspacePath);
    return undefined;
  }));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.selectFinding', (findingId?: unknown) => {
    if (typeof findingId !== 'string') {
      return undefined;
    }

    dependencies.model.selectFinding(findingId);
    return dependencies.detailPanel.revealSelected({
      preserveFocus: true
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('openshrike.openEvidence', (reference?: unknown) => {
    return openEvidenceReference(
      typeof reference === 'string' ? reference : undefined,
      dependencies.model.getState().workspacePath
    );
  }));
}

async function runInitInTerminal(input: {
  workspacePath?: string;
  initEnvironmentMonitor: OpenShrikeInitEnvironmentMonitor;
}): Promise<unknown> {
  const workspaceRoot = input.workspacePath ?? resolveWorkspaceRootPath();
  if (!workspaceRoot) {
    return vscode.window.showWarningMessage('Open a workspace folder before running OpenShrike init.');
  }

  const initEnvironment = await input.initEnvironmentMonitor.refresh(workspaceRoot);
  if (!isInitEnvironmentReady(initEnvironment)) {
    return await promptForBlockedInitEnvironment(initEnvironment);
  }

  launchTerminalCommand({
    name: 'OpenShrike Init',
    cwd: workspaceRoot,
    command: 'shrike init'
  });

  return vscode.window.showInformationMessage(
    'Started `shrike init` in the integrated terminal. Click "Done" in the OpenShrike panel after initialization completes.'
  );
}

async function installShrikeCli(input: {
  workspacePath?: string;
  initEnvironmentMonitor: OpenShrikeInitEnvironmentMonitor;
}): Promise<unknown> {
  const workspaceRoot = input.workspacePath ?? resolveWorkspaceRootPath();
  if (!workspaceRoot) {
    return vscode.window.showWarningMessage('Open a workspace folder before installing the shrike CLI.');
  }

  const initEnvironment = await input.initEnvironmentMonitor.refresh(workspaceRoot);
  if (
    initEnvironment.statusKind === 'checking'
    || initEnvironment.statusKind === 'missing'
    || initEnvironment.statusKind === 'unsupported'
    || initEnvironment.statusKind === 'error'
  ) {
    return await promptForBlockedInitEnvironment(initEnvironment);
  }

  launchTerminalCommand({
    name: 'OpenShrike Setup',
    cwd: workspaceRoot,
    command: SHRIKE_CLI_INSTALL_COMMAND
  });

  return vscode.window.showInformationMessage(
    `Running \`${SHRIKE_CLI_INSTALL_COMMAND}\` in the integrated terminal. Click "Done" in the OpenShrike panel after the install completes.`
  );
}

async function refreshInitializationState(input: {
  workspacePath?: string;
  model: OpenShrikeExtensionModel;
  controller: OpenShrikeScanController;
  initEnvironmentMonitor: OpenShrikeInitEnvironmentMonitor;
}): Promise<unknown> {
  const workspaceRoot = input.workspacePath ?? resolveWorkspaceRootPath();
  if (!workspaceRoot) {
    return vscode.window.showWarningMessage('Open a workspace folder before completing OpenShrike initialization.');
  }

  const workspace = {
    name: input.model.getState().workspacePath === workspaceRoot
      ? input.model.getState().workspaceName
      : path.basename(workspaceRoot),
    path: workspaceRoot
  };

  await input.initEnvironmentMonitor.refresh(workspaceRoot, {
    announceChecking: true
  });
  await input.controller.initialize(workspace);
  await input.controller.loadLastScan(workspace, {
    silentMissing: true
  });
  return undefined;
}

function launchTerminalCommand(input: {
  name: string;
  cwd: string;
  command: string;
}): void {
  const terminal = vscode.window.createTerminal({
    name: input.name,
    cwd: input.cwd
  });
  terminal.show();
  terminal.sendText(input.command, true);
}

function openSelectedCheckMarkdown(model: OpenShrikeExtensionModel): Thenable<unknown> | Promise<unknown> {
  const selectedFinding = model.getSelectedFinding();
  if (!selectedFinding) {
    return vscode.window.showInformationMessage('Select a finding before opening its check markdown.');
  }

  return openWorkspaceFile(selectedFinding.checkMarkdown, undefined, model.getState().workspacePath);
}

function openSelectedSource(model: OpenShrikeExtensionModel): Thenable<unknown> | Promise<unknown> {
  const selectedFinding = model.getSelectedFinding();
  if (!selectedFinding) {
    return vscode.window.showInformationMessage('Select a finding before opening its source context.');
  }

  const firstEvidenceReference = selectedFinding.evidence.find(evidence => parseEvidenceLocation(evidence.location ?? evidence.raw))?.location
    ?? selectedFinding.evidence.find(evidence => parseEvidenceLocation(evidence.raw))?.raw;

  if (firstEvidenceReference) {
    return openEvidenceReference(firstEvidenceReference, model.getState().workspacePath);
  }

  return openWorkspaceFile(selectedFinding.checkMarkdown, undefined, model.getState().workspacePath);
}

function openEvidenceReference(reference?: string, basePath?: string): Thenable<unknown> | Promise<unknown> {
  if (!reference) {
    return vscode.window.showInformationMessage('Select a finding evidence link with a file location to open it in the editor.');
  }

  const location = parseEvidenceLocation(reference);
  if (!location) {
    return vscode.window.showInformationMessage(`Open Evidence: ${reference} does not include a file location.`);
  }

  return openWorkspaceFile(location.filePath, {
    startLine: location.startLine,
    endLine: location.endLine
  }, basePath);
}

async function openWorkspaceFile(
  filePath: string,
  range?: {startLine: number; endLine: number},
  basePath?: string
): Promise<unknown> {
  const workspaceRoot = basePath ?? resolveWorkspaceRootPath();
  if (!workspaceRoot) {
    return vscode.window.showWarningMessage('Open a workspace folder before opening OpenShrike file links.');
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);

  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath));
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: true
    });

    if (range && document.lineCount > 0) {
      const startLine = clampLineNumber(range.startLine, document.lineCount);
      const endLine = clampLineNumber(range.endLine, document.lineCount);
      const start = new vscode.Position(startLine, 0);
      const endCharacter = document.lineAt(endLine).text.length;
      const end = new vscode.Position(endLine, endCharacter);
      const selection = new vscode.Selection(start, end);
      editor.selection = selection;
      editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
    }

    return editor;
  } catch (error) {
    return vscode.window.showWarningMessage(
      `OpenShrike could not open ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function resolveLastScanPath(model: OpenShrikeExtensionModel): string {
  return model.getState().lastScanPath;
}

function resolveWorkspaceRootPath(): string | null {
  const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
  const activeWorkspaceFolder = activeDocumentUri
    ? vscode.workspace.getWorkspaceFolder(activeDocumentUri)
    : undefined;
  const selectedFolder = activeWorkspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  return selectedFolder?.uri.fsPath ?? null;
}

function clampLineNumber(lineNumber: number, lineCount: number): number {
  return Math.max(0, Math.min(lineCount - 1, lineNumber - 1));
}

async function ensureWorkspaceInitialized(
  workspacePath: string,
  initEnvironmentMonitor: OpenShrikeInitEnvironmentMonitor
): Promise<boolean> {
  const projectConfig = await loadProjectConfigForRepo(workspacePath).catch(() => null);
  if (projectConfig) {
    return true;
  }

  const initEnvironment = await initEnvironmentMonitor.refresh(workspacePath);
  if (!isInitEnvironmentReady(initEnvironment)) {
    return await promptForBlockedInitEnvironment(initEnvironment).then(() => false);
  }

  const selection = await vscode.window.showWarningMessage(
    'The current repository is not initialized for OpenShrike. Run `shrike init` in the integrated terminal first.',
    'Run shrike init'
  );
  if (selection === 'Run shrike init') {
    await vscode.commands.executeCommand('openshrike.runInitInTerminal', workspacePath);
  }

  return false;
}

async function runLongOperation(
  title: string,
  dependencies: {
    controller: OpenShrikeScanController;
    output: OpenShrikeOutputChannel;
  },
  operation: () => Promise<unknown>,
  options: {
    cancellable?: boolean;
  } = {}
): Promise<unknown> {
  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: options.cancellable ?? false
      },
      async (_progress, token) => {
        if (options.cancellable) {
          token.onCancellationRequested(() => {
            void dependencies.controller.cancelScan();
          });
        }

        return await operation();
      }
    );
  } catch (error) {
    dependencies.output.show(true);
    return vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error),
      'Show Output'
    ).then(selection => {
      if (selection === 'Show Output') {
        dependencies.output.show();
      }

      return undefined;
    });
  }
}

async function runFindingAction(
  title: string,
  dependencies: {
    controller: OpenShrikeScanController;
    model: OpenShrikeExtensionModel;
    detailPanel: OpenShrikeDetailPanel;
    output: OpenShrikeOutputChannel;
  },
  action: () => Promise<unknown>
): Promise<unknown> {
  if (!dependencies.model.getSelectedFinding()) {
    return vscode.window.showInformationMessage('Select a finding before running this action.');
  }

  return await runLongOperation(title, dependencies, action);
}

async function revealSelectionAfterDataLoad(
  model: OpenShrikeExtensionModel,
  detailPanel: OpenShrikeDetailPanel
): Promise<void> {
  if (!model.getSelectedFinding()) {
    return;
  }

  await detailPanel.revealSelected({
    preserveFocus: true
  });
}

function isScanOverridesInput(value: unknown): value is Partial<ScanCommandOptions> {
  return typeof value === 'object' && value !== null;
}

function coerceScopeSelectionInput(value: unknown): Pick<ScanCommandOptions, 'scanScope' | 'scanTarget'> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const scanScope = typeof (value as {scanScope?: unknown}).scanScope === 'string'
    ? (value as {scanScope: string}).scanScope
    : null;
  if (!scanScope || !['uncommitted', 'commit', 'branch', 'pr', 'full'].includes(scanScope)) {
    return null;
  }

  const scanTarget = typeof (value as {scanTarget?: unknown}).scanTarget === 'string'
    ? (value as {scanTarget: string}).scanTarget
    : undefined;
  return {
    scanScope: scanScope as ScanCommandOptions['scanScope'],
    ...(scanTarget ? {scanTarget} : {})
  };
}

function coerceRuntimeModeInput(value: unknown): RuntimeMode | null {
  if (value === 'native' || value === 'docker') {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const runtimeMode = (value as {runtimeMode?: unknown}).runtimeMode;
  return runtimeMode === 'native' || runtimeMode === 'docker'
    ? runtimeMode
    : null;
}

function getSelectedFindingLabel(model: OpenShrikeExtensionModel): string {
  const selectedFinding = model.getSelectedFinding();
  return selectedFinding ? `"${selectedFinding.title}"` : 'The selected finding';
}

function buildBlockedInitMessage(initEnvironment: InitEnvironmentState): string {
  switch (initEnvironment.statusKind) {
    case 'missing':
      return 'OpenShrike cannot run `shrike init` because Node.js 22+ was not found on the current workspace host.';
    case 'unsupported':
      return `OpenShrike detected ${initEnvironment.detectedNodeVersion ?? 'an unsupported Node.js version'} on the current workspace host, but \`shrike init\` requires Node.js 22+.`;
    case 'cli-missing':
      return `OpenShrike cannot run \`shrike init\` because the shrike CLI was not found on the current workspace host. Install it with \`${SHRIKE_CLI_INSTALL_COMMAND}\`, then click "Done" and try again.`;
    case 'error':
      return 'OpenShrike could not verify Node.js and the shrike CLI on the current workspace host. Verify `node --version` and `shrike --version` in a terminal, then click "Done" and try again.';
    case 'checking':
      return 'OpenShrike is still checking whether Node.js 22+ and the shrike CLI are available on the current workspace host.';
    case 'ready':
      return 'OpenShrike is ready to run `shrike init`.';
  }
}

async function promptForBlockedInitEnvironment(initEnvironment: InitEnvironmentState): Promise<unknown> {
  const actions = resolveBlockedInitActions(initEnvironment);
  const selection = await vscode.window.showWarningMessage(buildBlockedInitMessage(initEnvironment), ...actions);

  if (selection === 'Install Node.js') {
    await vscode.commands.executeCommand('openshrike.openNodeInstallPage');
  }

  if (selection === 'Install shrike CLI') {
    await vscode.commands.executeCommand('openshrike.installShrikeCli');
  }

  return undefined;
}

function resolveBlockedInitActions(initEnvironment: InitEnvironmentState): string[] {
  switch (initEnvironment.statusKind) {
    case 'missing':
    case 'unsupported':
      return ['Install Node.js'];
    case 'cli-missing':
      return ['Install shrike CLI'];
    case 'checking':
    case 'error':
    case 'ready':
      return [];
  }
}
