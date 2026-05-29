import assert from 'node:assert/strict';
import path from 'node:path';
import * as vscode from 'vscode';

async function main() {
  const repoPath = process.env.OPENSHRIKE_EXTENSION_TEST_REPO;
  assert.ok(repoPath, 'OPENSHRIKE_EXTENSION_TEST_REPO must be set');

  const extension = vscode.extensions.getExtension('openshrike-local.openshrike');
  assert.ok(extension, 'OpenShrike extension should be available');

  const api = await extension.activate();
  assert.ok(api, 'OpenShrike activation should return an API');

  await vscode.commands.executeCommand('workbench.view.extension.openshrike');
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('openshrike.runScanWithOverrides'), 'Scan command should be registered');
  assert.ok(commands.includes('openshrike.runScanWithScopeOverride'), 'Scope command should be registered');
  assert.ok(commands.includes('openshrike.runScanWithRuntimeOverride'), 'Runtime override command should be registered');

  await vscode.commands.executeCommand('openshrike.runScanWithOverrides', {
    mockOpencode: true,
    runtimeMode: 'native',
    scanScope: 'full',
    parallelism: 1
  });

  const stateAfterScan = api.getState();
  assert.equal(stateAfterScan.statusKind, 'completed');
  assert.equal(stateAfterScan.counts.total, 1);
  assert.equal(stateAfterScan.findings.length, 1);

  await vscode.commands.executeCommand('openshrike.openCheckMarkdown');
  assert.ok(vscode.window.activeTextEditor, 'Check markdown should open in the editor');
  assert.equal(
    path.basename(vscode.window.activeTextEditor.document.uri.fsPath),
    'bp-test-001-sample.md'
  );

  await vscode.commands.executeCommand('openshrike.openEvidence', 'README.md:1');
  assert.ok(vscode.window.activeTextEditor, 'Evidence should open in the editor');
  assert.equal(path.basename(vscode.window.activeTextEditor.document.uri.fsPath), 'README.md');

  await vscode.commands.executeCommand('openshrike.loadLastScan');
  const loadedState = api.getState();
  assert.equal(loadedState.statusKind, 'loaded');
  assert.equal(loadedState.counts.total, 1);

  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

await main();
