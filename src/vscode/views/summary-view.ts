import * as vscode from 'vscode';
import type {OpenShrikeExtensionModel} from '../extension-model.js';
import {renderExtensionErrorHtml} from './error-html.js';
import {renderSummaryHtml} from './summary-html.js';

interface SummaryViewCallbacks {
  onDidResolve?(isVisible: boolean): void;
  onDidChangeVisibility?(isVisible: boolean): void;
}

export class OpenShrikeSummaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | null = null;
  private readonly unsubscribe: () => void;
  private visibilitySubscription: vscode.Disposable | null = null;

  constructor(
    private readonly model: OpenShrikeExtensionModel,
    private readonly callbacks: SummaryViewCallbacks = {}
  ) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    this.visibilitySubscription?.dispose();
    this.visibilitySubscription = webviewView.onDidChangeVisibility(() => {
      this.callbacks.onDidChangeVisibility?.(webviewView.visible);
      if (webviewView.visible) {
        this.render();
      }
    });
    webviewView.webview.options = {
      enableCommandUris: true
    };
    console.info('[OpenShrike] Resolving summary webview');
    this.callbacks.onDidResolve?.(webviewView.visible);

    try {
      this.render();
    } catch (error) {
      console.error('[OpenShrike] Failed to resolve summary webview', error);
      webviewView.webview.html = renderExtensionErrorHtml('OpenShrike summary failed to load.', error);
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.visibilitySubscription?.dispose();
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
