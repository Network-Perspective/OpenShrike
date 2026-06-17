import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createEmptyScanState} from '../src/vscode/scan-data.js';
import {OpenShrikeExtensionModel} from '../src/vscode/extension-model.js';
import {
  createMissingInitEnvironmentState,
  createReadyInitEnvironmentState
} from '../src/vscode/init-environment-state.js';

const {
  commandsRegistry,
  createTerminal,
  executeCommand,
  openExternal,
  parseUri,
  showInformationMessage,
  showWarningMessage
} = vi.hoisted(() => {
  const commandsRegistry = new Map<string, (...args: unknown[]) => unknown>();

  return {
    commandsRegistry,
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn()
    })),
    executeCommand: vi.fn(),
    openExternal: vi.fn(),
    parseUri: vi.fn((value: string) => ({value})),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn()
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
  it('launches the bundled CLI with the resolved Node.js executable when Node.js is ready', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-ready-'));
    tempDirectories.push(workspacePath);
    const extensionRoot = await createBundledCliFixture();
    const initEnvironmentMonitor = {
      refresh: vi.fn().mockResolvedValue(createReadyInitEnvironmentState({
        detectedVersion: 'v22.18.0',
        detectedPath: '/usr/bin/node'
      })),
      scheduleRefresh: vi.fn()
    };
    const model = new OpenShrikeExtensionModel(createEmptyScanState({
      workspaceName: 'Workspace',
      workspacePath
    }), null);

    registerExtensionCommands(makeContext(), {
      model,
      controller: makeControllerStub(),
      detailPanel: makeDetailPanelStub(),
      output: makeOutputStub(),
      initEnvironmentMonitor: initEnvironmentMonitor as never,
      extensionRoot
    });

    const command = commandsRegistry.get('openshrike.runInitInTerminal');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(initEnvironmentMonitor.refresh).toHaveBeenCalledWith(workspacePath);
    expect(createTerminal).toHaveBeenCalledWith({
      name: 'OpenShrike Init',
      cwd: workspacePath,
      shellPath: '/usr/bin/node',
      shellArgs: [path.join(extensionRoot, 'dist', 'cli.js'), 'init'],
      env: {
        OPENSHRIKE_TOOL_ROOT: extensionRoot
      }
    });
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Started the bundled `shrike init` wizard in the integrated terminal. Return to OpenShrike and run a scan when initialization completes.'
    );
  });

  it('blocks the bundled init launch and offers the Node.js install command when Node.js is unavailable', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-missing-'));
    tempDirectories.push(workspacePath);
    const extensionRoot = await createBundledCliFixture();
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
      controller: makeControllerStub(),
      detailPanel: makeDetailPanelStub(),
      output: makeOutputStub(),
      initEnvironmentMonitor: initEnvironmentMonitor as never,
      extensionRoot
    });

    const command = commandsRegistry.get('openshrike.runInitInTerminal');
    expect(command).toBeTypeOf('function');

    await command?.(workspacePath);

    expect(createTerminal).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(
      'OpenShrike cannot run the bundled init wizard because Node.js 22+ was not found on the current workspace host.',
      'Install Node.js'
    );
    expect(executeCommand).toHaveBeenCalledWith('openshrike.openNodeInstallPage');
  });

  it('opens the official Node.js install page and schedules a refresh', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-command-install-'));
    tempDirectories.push(workspacePath);
    const extensionRoot = await createBundledCliFixture();
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
      controller: makeControllerStub(),
      detailPanel: makeDetailPanelStub(),
      output: makeOutputStub(),
      initEnvironmentMonitor: initEnvironmentMonitor as never,
      extensionRoot
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
    loadLastScan: vi.fn(),
    recheckSelectedFinding: vi.fn(),
    runScan: vi.fn(),
    setRuntimeMode: vi.fn(),
    setScopeSelection: vi.fn()
  } as never;
}

function makeDetailPanelStub() {
  return {
    revealSelected: vi.fn()
  } as never;
}

function makeOutputStub() {
  return {
    show: vi.fn()
  } as never;
}

async function createBundledCliFixture(): Promise<string> {
  const extensionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-extension-root-'));
  tempDirectories.push(extensionRoot);
  await fs.mkdir(path.join(extensionRoot, 'dist'), {recursive: true});
  await fs.writeFile(path.join(extensionRoot, 'dist', 'cli.js'), 'console.log("shrike");\n', 'utf8');
  return extensionRoot;
}
