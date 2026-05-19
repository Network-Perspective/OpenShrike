import * as vscode from 'vscode';
import {registerMockCommands} from './commands.js';
import {createMockScanState, getDefaultSelectedFindingId} from './mock-data.js';
import {MockExtensionModel} from './mock-model.js';
import {OpenShrikeOutputChannel} from './output-channel.js';
import {OpenShrikeStatusBar} from './status-bar.js';
import {OpenShrikeTreeProvider, isFindingTreeItem} from './views/check-tree.js';
import {OpenShrikeDetailPanel} from './views/detail-panel.js';
import {OpenShrikeSummaryViewProvider} from './views/summary-view.js';
import {resolveWorkspaceTarget} from './workspace-target.js';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceTarget = resolveWorkspaceTarget();
  const state = createMockScanState({
    workspaceName: workspaceTarget.name,
    workspacePath: workspaceTarget.path
  });
  const model = new MockExtensionModel(state, getDefaultSelectedFindingId(state));
  const output = new OpenShrikeOutputChannel(model);
  const treeProvider = new OpenShrikeTreeProvider(model);
  const detailPanel = new OpenShrikeDetailPanel(model);
  const summaryViewProvider = new OpenShrikeSummaryViewProvider(model);
  const statusBar = new OpenShrikeStatusBar(model);
  const treeView = vscode.window.createTreeView('openshrike.checks', {
    treeDataProvider: treeProvider,
    showCollapseAll: false
  });

  const updateChecksViewMetadata = () => {
    treeView.description = `${state.counts.visible} of ${state.counts.total} · ${formatSortMode(model.getSortMode())}`;
  };

  updateChecksViewMetadata();
  treeView.badge = {
    value: state.counts.fail,
    tooltip: `${state.counts.fail} failing checks in the mock scan summary`
  };

  context.subscriptions.push(
    output,
    treeProvider,
    detailPanel,
    summaryViewProvider,
    statusBar,
    treeView,
    vscode.window.registerWebviewViewProvider('openshrike.summary', summaryViewProvider)
  );

  context.subscriptions.push(
    treeView.onDidChangeSelection(event => {
      const selectedFinding = event.selection.find(isFindingTreeItem);

      if (!selectedFinding) {
        return;
      }

      model.selectFinding(selectedFinding.finding.id);
      void detailPanel.revealSelected({
        preserveFocus: true
      });
    })
  );

  const unsubscribeModel = model.subscribe(() => {
    updateChecksViewMetadata();
  });

  context.subscriptions.push({
    dispose: unsubscribeModel
  });

  registerMockCommands(context, {
    model,
    output
  });

  void detailPanel.revealSelected({
    preserveFocus: true
  });
}

export function deactivate(): void {
  // No-op: the extension relies on VS Code disposables for teardown.
}

function formatSortMode(sortMode: 'id' | 'status' | 'name'): string {
  switch (sortMode) {
    case 'id':
      return 'ID';
    case 'status':
      return 'Status';
    case 'name':
      return 'Name';
  }
}
