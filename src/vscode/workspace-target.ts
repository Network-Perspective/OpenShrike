import * as vscode from 'vscode';

export interface WorkspaceTarget {
  name: string;
  path: string;
}

export function resolveWorkspaceTarget(): WorkspaceTarget {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
  const activeWorkspaceFolder = activeDocumentUri
    ? vscode.workspace.getWorkspaceFolder(activeDocumentUri)
    : undefined;
  const selectedFolder = activeWorkspaceFolder ?? workspaceFolders?.[0];

  if (!selectedFolder) {
    return {
      name: 'No Workspace Open',
      path: 'Open a folder to preview the mock workspace context.'
    };
  }

  if (!workspaceFolders || workspaceFolders.length <= 1) {
    return {
      name: selectedFolder.name,
      path: selectedFolder.uri.fsPath
    };
  }

  return {
    name: `${selectedFolder.name} (+${workspaceFolders.length - 1} more)`,
    path: selectedFolder.uri.fsPath
  };
}
