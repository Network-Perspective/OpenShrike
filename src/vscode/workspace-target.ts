import * as vscode from 'vscode';
import {loadProjectConfigForRepo} from '../lib/project-config.js';

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

export async function resolveWorkspaceTargetForCommand(): Promise<WorkspaceTarget | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return null;
  }

  const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
  const activeWorkspaceFolder = activeDocumentUri
    ? vscode.workspace.getWorkspaceFolder(activeDocumentUri)
    : undefined;

  const selectedFolder = workspaceFolders.length === 1
    ? workspaceFolders[0]
    : activeWorkspaceFolder
      ?? await promptForWorkspaceFolder(workspaceFolders);

  if (!selectedFolder) {
    return null;
  }

  const loadedProjectConfig = await loadProjectConfigForRepo(selectedFolder.uri.fsPath).catch(() => null);
  return {
    name: selectedFolder.name,
    path: loadedProjectConfig?.repoRoot ?? selectedFolder.uri.fsPath
  };
}

async function promptForWorkspaceFolder(
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.WorkspaceFolder | undefined> {
  return await vscode.window.showQuickPick(
    workspaceFolders.map(folder => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder
    })),
    {
      title: 'Choose workspace for OpenShrike',
      placeHolder: 'Select the workspace folder to scan'
    }
  ).then(selection => selection?.folder);
}
