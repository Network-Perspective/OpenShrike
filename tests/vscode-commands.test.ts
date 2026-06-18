import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createEmptyScanState} from '../src/vscode/scan-data.js';
import {OpenShrikeExtensionModel} from '../src/vscode/extension-model.js';
import {
  createMissingInitEnvironmentState,
  createMissingShrikeInitEnvironmentState,
  createReadyInitEnvironmentState
} from '../src/vscode/init-environment-state.js';

const {
  commandsRegistry,
  createTerminal,
  executeCommand,
  openExternal,
  parseUri,
  showInformationMessage,
  showWarningMessage,
  terminalSendText,
  terminalShow
} = vi.hoisted(() => {
  const commandsRegistry = new Map<string, (...args: unknown[]) => unknown>();
  const terminalShow = vi.fn();
  const terminalSendText = vi.fn();

  return {
    commandsRegistry,
    createTerminal: vi.fn(() => ({
      show: terminalShow,
      sendText: terminalSendText
    })),
    executeCommand: vi.fn(),
    openExternal: vi.fn(),
    parseUri: vi.fn((value: string) => ({value})),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    terminalSendText,
    terminalShow
  };
});

vi.mock('vscode', () => ({
  Uri: {
    parse: parseUri
  },
  commands: {
    registerCommand: vi.fn((command: string, callback: (...args: unknown[]) => unknown) => {
      commandsRegistry.set(command, callback);
      return {
        dispose() {}
      };
    }),
    executeCommand
  },
  env: {
    openExternal
  },
  window: {
    activeTextEditor: undefined,
    createTerminal,
    onDidChangeWindowState: vi.fn(() => ({
      dispose() {}
    })),
    showErrorMessage: vi.fn(),
    showInformationMessage,
    showTextDocument: vi.fn(),
    showWarningMessage,
    withProgress: vi.fn()
  },
  workspace: {
    workspaceFolders: [{
      name: 'Workspace',
      uri: {
        fsPath: '/tmp/workspace'
      }
    }],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => undefined)
    })),
    getWorkspaceFolder: vi.fn(),
    openTextDocument: vi.fn()
  }
}));

const {registerExtensionCommands} = await import('../src/vscode/commands.js');

const tempDirectories: string[] = [];

beforeEach(() => {
  commandsRegistry.clear();
  createTerminal.mockClear();
  terminalShow.mockReset();
  terminalSendText.mockReset();
  executeCommand.mockReset();
  executeCommand.mockResolvedValue(undefined);
  openExternal.mockReset();
  openExternal.mockResolvedValue(true);
  parseUri.mockClear();
  showInformationMessage.mockReset();
  showInformationMessage.mockResolvedValue(undefined);
  showWarningMessage.mockReset();
  showWarningMessage.mockResolvedValue(undefined);
});

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('VS Code init commands', () => {
  it('launches `shrike init` in the integrated terminal when Node.js and shrike are ready', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-ready-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createReadyInitEnvironmentState({
        detectedNodeVersion: 'v22.18.0',
        detectedNodePath: '/usr/bin/node',
        detectedShrikePath: '/usr/bin/shrike'
      })),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub() as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.runInitInTerminal');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(initEnvironmentMonitor.refresh).toHaveBeenCalledWith(workspacePath);
    expect(createTerminal).toHaveBeenCalledWith({
      name: 'OpenShrike Init',
      cwd: workspacePath
    });
    expect(terminalShow).toHaveBeenCalledTimes(1);
    expect(terminalSendText).toHaveBeenCalledWith('shrike init', true);
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Started `shrike init` in the integrated terminal. Click "Done" in the OpenShrike panel after initialization completes.'
    );
  });

  it('blocks init launch and offers the Node.js install command when Node.js is unavailable', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-missing-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createMissingInitEnvironmentState()),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);
    showWarningMessage.mockResolvedValue('Install Node.js');

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub() as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.runInitInTerminal');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(createTerminal).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(
      'OpenShrike cannot run `shrike init` because Node.js 22+ was not found on the current workspace host.',
      'Install Node.js'
    );
    expect(executeCommand).toHaveBeenCalledWith('openshrike.openNodeInstallPage');
  });

  it('blocks init launch and offers the shrike CLI install command when shrike is unavailable', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-shrike-missing-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createMissingShrikeInitEnvironmentState({
        detectedNodeVersion: 'v22.18.0',
        detectedNodePath: '/usr/bin/node'
      })),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);
    showWarningMessage.mockResolvedValue('Install shrike CLI');

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub() as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.runInitInTerminal');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(createTerminal).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(
      'OpenShrike cannot run `shrike init` because the shrike CLI was not found on the current workspace host. Install it with `npm install -g @networkperspective/openshrike`, then click "Done" and try again.',
      'Install shrike CLI'
    );
    expect(executeCommand).toHaveBeenCalledWith('openshrike.installShrikeCli');
  });

  it('runs the shrike CLI install command in the integrated terminal', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-install-shrike-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createMissingShrikeInitEnvironmentState({
        detectedNodeVersion: 'v22.18.0',
        detectedNodePath: '/usr/bin/node'
      })),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub() as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.installShrikeCli');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(initEnvironmentMonitor.refresh).toHaveBeenCalledWith(workspacePath);
    expect(createTerminal).toHaveBeenCalledWith({
      name: 'OpenShrike Setup',
      cwd: workspacePath
    });
    expect(terminalShow).toHaveBeenCalledTimes(1);
    expect(terminalSendText).toHaveBeenCalledWith('npm install -g @networkperspective/openshrike', true);
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Running `npm install -g @networkperspective/openshrike` in the integrated terminal. Click "Done" in the OpenShrike panel after the install completes.'
    );
  });

  it('refreshes initialization state and reloads repository state', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-refresh-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createMissingInitEnvironmentState()),
      scheduleRefresh: vi.fn()
    };
    const controller = makeControllerStub();
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);

    registerExtensionCommands(makeContext(), {
      model,
      controller: controller as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.refreshInitialization');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(initEnvironmentMonitor.refresh).toHaveBeenCalledWith(workspacePath, {
      announceChecking: true
    });
    expect(controller.initialize).toHaveBeenCalledWith({
      name: 'Workspace',
      path: workspacePath
    });
    expect(controller.loadLastScan).toHaveBeenCalledWith({
      name: 'Workspace',
      path: workspacePath
    }, {
      silentMissing: true
    });
  });

  it('opens the official Node.js install page and schedules a refresh', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-install-'));
    tempDirectories.push(workspacePath);
    const initEnvironmentMonitor = {
      refresh: vi.fn(),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub() as never,
      detailPanel: makeDetailPanelStub() as never,
      output: makeOutputStub() as never,
      initEnvironmentMonitor: initEnvironmentMonitor as never
    });

    const command = commandsRegistry.get('openshrike.openNodeInstallPage');
    expect(command).toBeTypeOf('function');

    await command?.();

    expect(parseUri).toHaveBeenCalledWith('https://nodejs.org/en/download');
    expect(openExternal).toHaveBeenCalledWith({
      value: 'https://nodejs.org/en/download'
    });
    expect(initEnvironmentMonitor.scheduleRefresh).toHaveBeenCalledWith(workspacePath);
  });
});

function makeContext() {
  return {
    subscriptions: [] as Array<{dispose(): void}>
  } as never;
}

function makeControllerStub() {
  return {
    cancelScan: vi.fn(),
    fixSelectedFinding: vi.fn(),
    initialize: vi.fn(),
    loadLastScan: vi.fn(),
    recheckSelectedFinding: vi.fn(),
    runScan: vi.fn(),
    setRuntimeMode: vi.fn(),
    setScopeSelection: vi.fn()
  };
}

function makeDetailPanelStub() {
  return {
    revealSelected: vi.fn()
  };
}

function makeOutputStub() {
  return {
    show: vi.fn()
  };
}
