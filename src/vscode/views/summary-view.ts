import * as vscode from 'vscode';
import type {OpenShrikeExtensionModel} from '../extension-model.js';
import {renderExtensionErrorHtml} from './error-html.js';
import {renderSummaryHtml} from './summary-html.js';

export class OpenShrikeSummaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly model: OpenShrikeExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableCommandUris: true
    };
    console.info('[OpenShrike] Resolving summary webview');

    try {
      this.render();
    } catch (error) {
      console.error('[OpenShrike] Failed to resolve summary webview', error);
      webviewView.webview.html = renderExtensionErrorHtml('OpenShrike summary failed to load.', error);
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private render(): void {
    if (!this.webviewView) {
      return;
    }

    try {
      this.webviewView.webview.html = renderSummaryHtml(this.model.getViewModel());
    } catch (error) {
      console.error('[OpenShrike] Failed to render summary webview', error);
      this.webviewView.webview.html = renderExtensionErrorHtml('OpenShrike summary failed to render.', error);
    }
  }
}
