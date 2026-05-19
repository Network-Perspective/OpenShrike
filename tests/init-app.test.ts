import React from 'react';
import {renderToString} from 'ink';
import {describe, expect, it} from 'vitest';
import {InitScreenLayout, moveOptionNavigation, type InitScreenSpec} from '../src/ui/init-app.js';

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
        {value: 'use-discovered', label: 'Continue with discovered OpenCode setup'},
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
        selectedValues: [],
        effectiveIndex: 0,
        visibleStart: 0
      }),
      {columns: 120}
    ));

    expect(output).toContain('┌  Shrike init');
    expect(output).toContain('◇  Project is already initialized');
    expect(output).toContain('│  Clear and run setup again');
    expect(output).toContain('◆  OpenCode discovery');
    expect(output.indexOf('◇  Project is already initialized')).toBeLessThan(output.indexOf('◆  OpenCode discovery'));
  });

  it('limits the visible option list to 10 rows and shows the current window', () => {
    const options = Array.from({length: 12}, (_, index) => ({
      value: `model-${index}` as const,
      label: `model-${index}`
    }));
    const spec: InitScreenSpec<(typeof options)[number]['value']> = {
      prompt: 'Select default model',
      options,
      searchable: true
    };

    const output = stripAnsi(renderToString(
      React.createElement(InitScreenLayout, {
        spec,
        history: [],
        query: '',
        showHelp: false,
        filteredOptions: spec.options,
        selectedValues: [],
        effectiveIndex: 0,
        visibleStart: 0
      }),
      {columns: 120}
    ));

    expect(output).toContain('model-0');
    expect(output).toContain('model-9');
    expect(output).not.toContain('model-10');
    expect(output).not.toContain('model-11');
    expect(output).toContain('Showing 1-10 of 12');
  });

  it('renders checkbox selections for multi-select screens', () => {
    const spec: InitScreenSpec<'typescript-baseline' | 'python-baseline'> = {
      prompt: 'Select default policies',
      options: [
        {value: 'typescript-baseline', label: 'typescript-baseline'},
        {value: 'python-baseline', label: 'python-baseline'}
      ],
      selectionMode: 'multiple'
    };

    const output = stripAnsi(renderToString(
      React.createElement(InitScreenLayout, {
        spec,
        history: [],
        query: '',
        showHelp: false,
        filteredOptions: spec.options,
        selectedValues: ['typescript-baseline'],
        effectiveIndex: 1,
        visibleStart: 0
      }),
      {columns: 120}
    ));

    expect(output).toContain('[x]  typescript-baseline');
    expect(output).toContain('› [ ]  python-baseline');
  });

  it('scrolls the visible window when moving past the bottom edge', () => {
    expect(moveOptionNavigation({
      selectedIndex: 9,
      visibleStart: 0
    }, 20, 1)).toEqual({
      selectedIndex: 10,
      visibleStart: 1
    });

    expect(moveOptionNavigation({
      selectedIndex: 10,
      visibleStart: 1
    }, 20, -1)).toEqual({
      selectedIndex: 9,
      visibleStart: 1
    });
  });
});
