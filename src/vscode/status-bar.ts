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
    const viewModel = this.model.getViewModel();
    this.statusBarItem.text = viewModel.statusBarText;
    this.statusBarItem.tooltip = viewModel.statusBarTooltip;
    this.statusBarItem.command = viewModel.canCancel ? 'openshrike.cancelScan' : 'openshrike.showOutput';
  }
}
