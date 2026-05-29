import * as vscode from 'vscode';
import type {MockExtensionModel} from '../mock-model.js';
import {renderExtensionErrorHtml} from './error-html.js';
import {renderChecksHtml} from './checks-html.js';

export class OpenShrikeChecksViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
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
      enableCommandUris: true
    };
    console.info('[OpenShrike] Resolving checks webview');

    try {
      this.render();
    } catch (error) {
      console.error('[OpenShrike] Failed to resolve checks webview', error);
      webviewView.webview.html = renderExtensionErrorHtml('OpenShrike checks failed to load.', error);
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
      this.webviewView.webview.html = renderChecksHtml(this.model.getViewModel());
    } catch (error) {
      console.error('[OpenShrike] Failed to render checks webview', error);
      this.webviewView.webview.html = renderExtensionErrorHtml('OpenShrike checks failed to render.', error);
    }
  }
}
