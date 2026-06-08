import * as vscode from 'vscode';
import {registerExtensionCommands} from './commands.js';
import {createEmptyScanState, getDefaultSelectedFindingId} from './scan-data.js';
import {OpenShrikeExtensionModel} from './extension-model.js';
import {OpenShrikeOutputChannel} from './output-channel.js';
import {OpenShrikeScanController} from './scan-controller.js';
import {OpenShrikeStatusBar} from './status-bar.js';
import {OpenShrikeChecksViewProvider} from './views/checks-view.js';
import {OpenShrikeDetailPanel} from './views/detail-panel.js';
import {OpenShrikeSummaryViewProvider} from './views/summary-view.js';
import {resolveWorkspaceTarget} from './workspace-target.js';

export interface OpenShrikeExtensionApi {
  getState(): ReturnType<OpenShrikeExtensionModel['getState']>;
  getViewModel(): ReturnType<OpenShrikeExtensionModel['getViewModel']>;
}

export function activate(context: vscode.ExtensionContext): OpenShrikeExtensionApi {
  try {
    process.env.OPENSHRIKE_TOOL_ROOT ??= context.extension.extensionPath;
    const workspaceTarget = resolveWorkspaceTarget();
    console.info('[OpenShrike] Activating extension', workspaceTarget);

    const state = createEmptyScanState({
      workspaceName: workspaceTarget.name,
      workspacePath: workspaceTarget.path,
      outputLines: ['[startup] OpenShrike extension activated.']
    });
    const model = new OpenShrikeExtensionModel(state, getDefaultSelectedFindingId(state));
    const controller = new OpenShrikeScanController(model);
    const output = new OpenShrikeOutputChannel(model);
    const checksViewProvider = new OpenShrikeChecksViewProvider(model);
    const detailPanel = new OpenShrikeDetailPanel(model);
    const summaryViewProvider = new OpenShrikeSummaryViewProvider(model);
    const statusBar = new OpenShrikeStatusBar(model);

    context.subscriptions.push(
      output,
      checksViewProvider,
      detailPanel,
      summaryViewProvider,
      statusBar,
      {
        dispose: () => {
          void controller.dispose();
        }
      },
      vscode.window.registerWebviewViewProvider('openshrike.checks', checksViewProvider),
      vscode.window.registerWebviewViewProvider('openshrike.summary', summaryViewProvider)
    );

    registerExtensionCommands(context, {
      model,
      controller,
      output,
      detailPanel
    });

    void controller.initialize(workspaceTarget).then(async () => {
      console.info('[OpenShrike] Controller initialized', workspaceTarget);
      await controller.loadLastScan(workspaceTarget, {
        silentMissing: true
      });
      console.info('[OpenShrike] Activation restore completed');
    }).catch(error => {
      console.error('[OpenShrike] Activation restore failed', error);
    });

    return {
      getState() {
        return model.getState();
      },
      getViewModel() {
        return model.getViewModel();
      }
    };
  } catch (error) {
    console.error('[OpenShrike] Activation failed', error);
    throw error;
  }
}

export function deactivate(): void {
  // No-op: the extension relies on VS Code disposables for teardown.
}
