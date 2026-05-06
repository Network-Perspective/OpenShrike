import React from 'react';
import {renderToString} from 'ink';
import {describe, expect, it} from 'vitest';
import {InitScreenLayout, type InitScreenSpec} from '../src/ui/init-app.js';

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

describe('init ui layout', () => {
  it('renders collapsed history above the active step with an opencode-style frame prefix', () => {
    const spec: InitScreenSpec<'use-discovered' | 'auth-login' | 'exit'> = {
      prompt: 'OpenCode discovery',
      bodyLines: ['Found existing OpenCode config:'],
      summaryItems: [
        {label: 'default model', value: 'azure/gpt-5.3-codex'},
        {label: 'providers', value: 'azure, lmstudio'},
        {label: 'config file', value: '~/.config/opencode/opencode.json'},
        {label: 'auth store', value: 'present (~/.local/share/opencode/auth.json)'}
      ],
      options: [
        {value: 'use-discovered', label: 'Use discovered OpenCode config'},
        {value: 'auth-login', label: 'Re-authenticate with `opencode auth login`'},
        {value: 'exit', label: 'Exit without changes'}
      ],
      allowBack: true,
      allowCancel: true
    };

    const output = stripAnsi(renderToString(
      React.createElement(InitScreenLayout, {
        spec,
        history: [
          {
            screen: 'existing-init',
            prompt: 'Project is already initialized',
            responseLines: ['Clear and run setup again']
          }
        ],
        query: '',
        showHelp: false,
        filteredOptions: spec.options,
        effectiveIndex: 0
      }),
      {columns: 120}
    ));

    expect(output).toContain('┌  Shrike init');
    expect(output).toContain('◇  Project is already initialized');
    expect(output).toContain('│  Clear and run setup again');
    expect(output).toContain('◆  OpenCode discovery');
    expect(output.indexOf('◇  Project is already initialized')).toBeLessThan(output.indexOf('◆  OpenCode discovery'));
  });
});
