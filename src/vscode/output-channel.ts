import * as vscode from 'vscode';
import type {MockExtensionModel} from './mock-model.js';

export class OpenShrikeOutputChannel implements vscode.Disposable {
  private readonly outputChannel = vscode.window.createOutputChannel('OpenShrike');
  private hasSeeded = false;

  constructor(private readonly model: MockExtensionModel) {
    this.seed();
  }

  show(preserveFocus = false): void {
    this.seed();
    this.outputChannel.show(preserveFocus);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }

  private seed(): void {
    if (this.hasSeeded) {
      return;
    }

    for (const line of this.model.getState().outputLines) {
      this.outputChannel.appendLine(line);
    }

    this.hasSeeded = true;
  }
}
