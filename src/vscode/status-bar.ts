import * as vscode from 'vscode';
import type {MockExtensionModel} from './mock-model.js';

export class OpenShrikeStatusBar implements vscode.Disposable {
  private readonly statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private readonly unsubscribe: () => void;

  constructor(private readonly model: MockExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });

    this.statusBarItem.name = 'OpenShrike';
    this.statusBarItem.command = 'openshrike.showOutput';
    this.render();
    this.statusBarItem.show();
  }

  dispose(): void {
    this.unsubscribe();
    this.statusBarItem.dispose();
  }

  private render(): void {
    const state = this.model.getState();
    const {counts} = state;
    this.statusBarItem.text = `$(shield) OpenShrike: ${counts.fail} failed`;
    this.statusBarItem.tooltip = [
      `${state.statusLabel} scan snapshot`,
      `${counts.total} total checks scanned`,
      `${counts.fail} failed`,
      `${counts.unknown} inconclusive`,
      `${counts.pass} passed`,
      state.activeOperationLabel,
      'Click to open the mock output channel.'
    ].join('\n');
  }
}
