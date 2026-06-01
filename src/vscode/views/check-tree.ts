import * as vscode from 'vscode';
import {formatCheckIdDisplay} from '../../lib/check-display.js';
import {getStatusLabel, type MockFinding, type MockFindingStatus} from '../mock-data.js';
import type {MockExtensionModel} from '../mock-model.js';

export class OpenShrikeTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly unsubscribe: () => void;

  constructor(private readonly model: MockExtensionModel) {
    this.unsubscribe = this.model.subscribe(() => {
      this.refresh();
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    return this.model.getSortedFindings().map(finding => new FindingTreeItem(finding));
  }

  dispose(): void {
    this.unsubscribe();
    this.onDidChangeTreeDataEmitter.dispose();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }
}

export function isFindingTreeItem(item: vscode.TreeItem): item is FindingTreeItem {
  return item instanceof FindingTreeItem;
}

export class FindingTreeItem extends vscode.TreeItem {
  constructor(readonly finding: MockFinding) {
    super(finding.title, vscode.TreeItemCollapsibleState.None);
    this.id = `openshrike.finding.${finding.id}`;
    this.description = formatCheckIdDisplay(finding.id);
    this.tooltip = `${getStatusLabel(finding.status)}\n${finding.summary}`;
    this.contextValue = 'finding';
    this.iconPath = getFindingIcon(finding.status);
  }
}

function getFindingIcon(status: MockFindingStatus): vscode.ThemeIcon {
  switch (status) {
    case 'fail':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'));
    case 'unknown':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    case 'pending':
      return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
    case 'running':
      return new vscode.ThemeIcon('sync', new vscode.ThemeColor('textLink.foreground'));
    case 'fixing':
      return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.blue'));
    case 'pass':
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
  }
}
