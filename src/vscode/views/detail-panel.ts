import * as vscode from 'vscode';
import type {MockExtensionModel} from '../mock-model.js';
import {renderFindingDetailHtml} from './detail-html.js';

const DETAIL_EDITOR_CONTEXT = 'openshrike.detailEditorActive';
const DETAIL_VIEW_TYPE = 'openshrike.detailEditor';

export class OpenShrikeDetailPanel implements vscode.Disposable {
  private webviewPanel: vscode.WebviewPanel | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly model: MockExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.render();
    });
  }

  async revealSelected(options: {preserveFocus?: boolean} = {}): Promise<void> {
    const finding = this.model.getSelectedFinding();

    if (!finding) {
      return;
    }

    const preserveFocus = options.preserveFocus ?? true;

    if (!this.webviewPanel) {
      this.webviewPanel = vscode.window.createWebviewPanel(
        DETAIL_VIEW_TYPE,
        createPanelTitle(finding.id),
        {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus
        },
        {
          enableCommandUris: true,
          enableFindWidget: true
        }
      );
      this.webviewPanel.onDidDispose(() => {
        this.webviewPanel = null;
        this.observePanelContext(false);
      });
      this.webviewPanel.onDidChangeViewState(event => {
        this.observePanelContext(event.webviewPanel.active);
      });
    } else {
      this.webviewPanel.reveal(undefined, preserveFocus);
    }

    this.render();
    this.observePanelContext(this.webviewPanel.active);
  }

  dispose(): void {
    this.unsubscribe();

    if (this.webviewPanel) {
      const panel = this.webviewPanel;
      this.webviewPanel = null;
      panel.dispose();
    }

    this.observePanelContext(false);
  }

  private render(): void {
    if (!this.webviewPanel) {
      return;
    }

    const finding = this.model.getSelectedFinding();

    if (!finding) {
      return;
    }

    this.webviewPanel.title = createPanelTitle(finding.id);
    this.webviewPanel.webview.html = renderFindingDetailHtml({
      viewModel: this.model.getViewModel()
    });
  }

  private setPanelContext(active: boolean): Thenable<unknown> {
    return vscode.commands.executeCommand('setContext', DETAIL_EDITOR_CONTEXT, active);
  }

  private observePanelContext(active: boolean): void {
    void Promise.resolve(this.setPanelContext(active)).catch((error: unknown) => {
      console.error('[OpenShrike] Failed to update detail panel context', error);
    });
  }
}

function createPanelTitle(findingId: string): string {
  return `${findingId} Details`;
}
