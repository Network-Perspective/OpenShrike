import * as vscode from 'vscode';
import type {MockExtensionModel} from '../mock-model.js';
import {renderSummaryHtml} from './summary-html.js';

export class OpenShrikeSummaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly model: MockExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: false
    };
    this.render();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private render(): void {
    if (!this.webviewView) {
      return;
    }

    this.webviewView.webview.html = renderSummaryHtml(this.model.getState());
  }
}
