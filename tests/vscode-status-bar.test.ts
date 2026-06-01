import {afterEach, describe, expect, it, vi} from 'vitest';

const {createStatusBarItem, statusBarItem} = vi.hoisted(() => {
  const statusBarItem = {
    command: '',
    dispose: vi.fn(),
    name: '',
    show: vi.fn(),
    text: '',
    tooltip: ''
  };

  return {
    createStatusBarItem: vi.fn(() => statusBarItem),
    statusBarItem
  };
});

vi.mock('vscode', () => ({
  StatusBarAlignment: {
    Left: 1
  },
  window: {
    createStatusBarItem
  }
}));

import {createMockScanState} from '../src/vscode/mock-data.js';
import {MockExtensionModel} from '../src/vscode/mock-model.js';
import {OpenShrikeStatusBar} from '../src/vscode/status-bar.js';

describe('VS Code status bar', () => {
  afterEach(() => {
    createStatusBarItem.mockClear();
    statusBarItem.command = '';
    statusBarItem.dispose.mockClear();
    statusBarItem.name = '';
    statusBarItem.show.mockClear();
    statusBarItem.text = '';
    statusBarItem.tooltip = '';
  });

  it('shows running progress and output command in the status bar', () => {
    const state = createMockScanState();
    const model = new MockExtensionModel(state, null);

    const statusBar = new OpenShrikeStatusBar(model);

    expect(createStatusBarItem).toHaveBeenCalledWith(1, 50);
    expect(statusBarItem.text).toBe('$(sync~spin) OpenShrike: 24/24');
    expect(statusBarItem.command).toBe('openshrike.showOutput');
    expect(statusBarItem.tooltip).toContain('2 failed');
    expect(statusBarItem.tooltip).toContain('19 passed');
    expect(statusBarItem.tooltip).toContain('3 inconclusive');
    expect(statusBarItem.show).toHaveBeenCalledTimes(1);

    statusBar.dispose();

    expect(statusBarItem.dispose).toHaveBeenCalledTimes(1);
  });
});
