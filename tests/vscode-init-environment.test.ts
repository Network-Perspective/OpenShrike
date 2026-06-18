import {describe, expect, it, vi} from 'vitest';
import {isNodeVersionSupported, parseNodeMajorVersion} from '../src/vscode/init-environment-state.js';

vi.mock('vscode', () => ({
  window: {
    onDidChangeWindowState: vi.fn(() => ({
      dispose() {}
    }))
  },
  workspace: {
    workspaceFolders: [{
      name: 'Workspace',
      uri: {
        fsPath: '/tmp/workspace'
      }
    }],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => undefined)
    }))
  }
}));

import {probeInitEnvironment} from '../src/vscode/init-environment.js';

describe('VS Code init environment', () => {
  it('rejects Node.js 21.x for the shrike init flow', () => {
    expect(parseNodeMajorVersion('v21.7.3')).toBe(21);
    expect(isNodeVersionSupported('v21.7.3')).toBe(false);
  });

  it('accepts Node.js 22.x for the shrike init flow', () => {
    expect(parseNodeMajorVersion('v22.0.0')).toBe(22);
    expect(isNodeVersionSupported('v22.0.0')).toBe(true);
  });

  it('accepts bare version strings as well as v-prefixed strings', () => {
    expect(parseNodeMajorVersion('22.18.0')).toBe(22);
    expect(isNodeVersionSupported('22.18.0')).toBe(true);
  });

  it('falls back to a direct node probe before reporting a generic init error', async () => {
    const runShellCommandPathProbe = vi.fn();
    const runDirectCommandPathProbe = vi.fn();

    const state = await probeInitEnvironment('/tmp/workspace', {
      runShellNodeProbe: async () => ({
        detectedNodeVersion: null,
        detectedNodePath: 'bash: node: command not found',
        missing: false,
        error: 'Node.js probe exited with code 1.'
      }),
      runDirectNodeProbe: async () => ({
        detectedNodeVersion: null,
        detectedNodePath: null,
        missing: true,
        error: null
      }),
      runShellCommandPathProbe,
      runDirectCommandPathProbe
    });

    expect(state.statusKind).toBe('missing');
    expect(state.message).toBe('Node.js was not found on the workspace host');
    expect(runShellCommandPathProbe).not.toHaveBeenCalled();
    expect(runDirectCommandPathProbe).not.toHaveBeenCalled();
  });

  it('falls back to a direct shrike probe before reporting a generic init error', async () => {
    const state = await probeInitEnvironment('/tmp/workspace', {
      runShellNodeProbe: async () => ({
        detectedNodeVersion: 'v22.18.0',
        detectedNodePath: '/usr/bin/node',
        missing: false,
        error: null
      }),
      runDirectNodeProbe: async () => {
        throw new Error('should not be called');
      },
      runShellCommandPathProbe: async () => ({
        detectedPath: 'bash: shrike: command not found',
        missing: false,
        error: 'The shrike CLI probe exited with code 1.'
      }),
      runDirectCommandPathProbe: async () => ({
        detectedPath: null,
        missing: true,
        error: null
      })
    });

    expect(state.statusKind).toBe('cli-missing');
    expect(state.message).toBe('shrike CLI was not found on the workspace host');
  });
});
