import * as vscode from 'vscode';
import type {MockExtensionModel} from './mock-model.js';

export class OpenShrikeOutputChannel implements vscode.Disposable {
  private readonly outputChannel = vscode.window.createOutputChannel('OpenShrike');
  private readonly unsubscribe: () => void;
  private renderedLineCount = 0;

  constructor(private readonly model: MockExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });
    this.render();
  }

  show(preserveFocus = false): void {
    this.render();
    this.outputChannel.show(preserveFocus);
  }

  dispose(): void {
    this.unsubscribe();
    this.outputChannel.dispose();
  }

  private render(): void {
    const lines = this.model.getState().outputLines;
    if (lines.length < this.renderedLineCount) {
      this.outputChannel.clear();
      this.renderedLineCount = 0;
    }

    for (const line of lines.slice(this.renderedLineCount)) {
      this.outputChannel.appendLine(line);
    }

    this.renderedLineCount = lines.length;
  }
}
