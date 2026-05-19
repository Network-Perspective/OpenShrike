import * as vscode from 'vscode';
import type {MockExtensionModel} from './mock-model.js';
import type {OpenShrikeOutputChannel} from './output-channel.js';

const PLACEHOLDER_MESSAGE = 'OpenShrike is running in mockup mode. This control is intentionally not wired to real runtime actions yet.';

export function registerMockCommands(
  context: vscode.ExtensionContext,
  dependencies: {
    model: MockExtensionModel;
    output: OpenShrikeOutputChannel;
  }
): void {
  const register = (command: string, callback: () => unknown | Thenable<unknown>) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register('openshrike.runInitInTerminal', () => showPlaceholder('Run Init In Terminal'));
  register('openshrike.runScan', () => showPlaceholder('Run Scan'));
  register('openshrike.runScanWithOverrides', () => showPlaceholder('Run Scan With Overrides'));
  register('openshrike.cancelScan', () => showPlaceholder('Cancel Scan'));
  register('openshrike.loadLastScan', () => showPlaceholder('Load Last Scan'));
  register('openshrike.openLastScan', () => showPlaceholder('Open Last Scan Snapshot'));
  register('openshrike.editFinding', () => showSelectedFindingPlaceholder('Edit', dependencies.model));
  register('openshrike.recheckFinding', () => showSelectedFindingPlaceholder('Recheck', dependencies.model));
  register('openshrike.fixFinding', () => showSelectedFindingPlaceholder('Fix', dependencies.model));
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
  register('openshrike.openCheckMarkdown', () => {
    return vscode.window.showInformationMessage(
      `${getSelectedFindingLabel(dependencies.model)} is shown from static mock data. Check markdown navigation is not wired yet.`
    );
  });
  register('openshrike.openEvidence', () => {
    return vscode.window.showInformationMessage(
      `${getSelectedFindingLabel(dependencies.model)} includes fake evidence links for layout review only.`
    );
  });
}

function showPlaceholder(action: string): Thenable<unknown> {
  return vscode.window.showInformationMessage(`${action}: ${PLACEHOLDER_MESSAGE}`);
}

function showSelectedFindingPlaceholder(action: string, model: MockExtensionModel): Thenable<unknown> {
  return vscode.window.showInformationMessage(`${action}: ${getSelectedFindingLabel(model)} is mock data only. No runtime action is wired yet.`);
}

function getSelectedFindingLabel(model: MockExtensionModel): string {
  const selectedFinding = model.getSelectedFinding();
  return selectedFinding ? `"${selectedFinding.title}"` : 'The selected finding';
}
