import {describe, expect, it} from 'vitest';
import {createRuntimeStreamState, reduceRuntimeEvent} from '../src/lib/runtime-events.js';
import type {Event} from '@opencode-ai/sdk';

describe('reduceRuntimeEvent', () => {
  it('accumulates assistant text and tool lifecycle events in chronological order', () => {
    let state = createRuntimeStreamState();

    state = reduceRuntimeEvent(
      state,
      {
        type: 'message.part.updated',
        properties: {
          delta: 'hello',
          part: {
            id: 'p1',
            sessionID: 's1',
            messageID: 'm1',
            type: 'text',
            text: 'hello'
          }
        }
      } satisfies Event
    );

    state = reduceRuntimeEvent(
      state,
      {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'p2',
            sessionID: 's1',
            messageID: 'm1',
            type: 'tool',
            callID: 'c1',
            tool: 'bash',
            state: {
              status: 'running',
              input: {
                command: 'npm test'
              },
              time: {
                start: Date.now()
              }
            }
          }
        }
      } satisfies Event
    );

    expect(state.items).toEqual([
      {
        kind: 'assistant',
        text: 'hello'
      },
      {
        kind: 'tool',
        text: 'bash running: npm test'
      }
    ]);
  });

  it('captures pty commands and completed tool output snippets', () => {
    let state = createRuntimeStreamState();

    state = reduceRuntimeEvent(
      state,
      {
        type: 'pty.created',
        properties: {
          info: {
            id: 'pty-1',
            title: 'bash',
            command: 'npm',
            args: ['test', '--runInBand'],
            cwd: '/repo',
            status: 'running',
            pid: 1234
          }
        }
      } satisfies Event
    );

    state = reduceRuntimeEvent(
      state,
      {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'p3',
            sessionID: 's1',
            messageID: 'm1',
            type: 'tool',
            callID: 'c2',
            tool: 'bash',
            state: {
              status: 'completed',
              input: {
                command: 'npm test --runInBand'
              },
              output: 'line 1\nline 2\nline 3\nline 4',
              title: 'npm test --runInBand',
              metadata: {},
              time: {
                start: Date.now(),
                end: Date.now() + 1
              }
            }
          }
        }
      } satisfies Event
    );

    expect(state.items).toEqual([
      {
        kind: 'pty',
        text: 'bash: npm test --runInBand [cwd /repo]'
      },
      {
        kind: 'tool',
        text: 'bash completed: npm test --runInBand'
      },
      {
        kind: 'tool-output',
        text: 'line 1\nline 2\nline 3\n...'
      }
    ]);
  });
});
