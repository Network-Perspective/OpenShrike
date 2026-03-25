import {describe, expect, it} from 'vitest';
import {buildCombinedStreamLines} from '../src/ui/scan-app.js';
import type {RuntimeStreamItem} from '../src/lib/runtime-events.js';

describe('buildCombinedStreamLines', () => {
  it('renders a single chronological timeline with typed prefixes', () => {
    const lines = buildCombinedStreamLines([
      {kind: 'event', text: 'session busy'},
      {kind: 'assistant', text: 'assistant line 1\nassistant line 2'},
      {kind: 'reasoning', text: 'reasoning line'},
      {kind: 'tool', text: 'bash running: npm test'},
      {kind: 'tool-output', text: 'line 1\nline 2'},
      {kind: 'pty', text: 'bash: npm test [cwd /repo]'}
    ] satisfies RuntimeStreamItem[]);

    expect(lines.map(line => line.text)).toEqual([
      '[evt] session busy',
      '[ai ] assistant line 1',
      '[ai ] assistant line 2',
      '[why] reasoning line',
      '[tool] bash running: npm test',
      '[out] line 1',
      '[out] line 2',
      '[cmd] bash: npm test [cwd /repo]'
    ]);
  });

  it('provides stable placeholder text when no runtime activity exists yet', () => {
    const lines = buildCombinedStreamLines([]);

    expect(lines.map(line => line.text)).toEqual(['[evt] Waiting for runtime activity...']);
  });
});
