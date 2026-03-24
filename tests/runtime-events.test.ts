import {describe, expect, it} from 'vitest';
import {createRuntimeStreamState, reduceRuntimeEvent} from '../src/lib/runtime-events.js';
import type {Event} from '@opencode-ai/sdk';

describe('reduceRuntimeEvent', () => {
  it('accumulates assistant text and event entries', () => {
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
              input: {},
              time: {
                start: Date.now()
              }
            }
          }
        }
      } satisfies Event
    );

    expect(state.output).toContain('hello');
    expect(state.entries.some(entry => entry.includes('bash running'))).toBe(true);
  });
});
