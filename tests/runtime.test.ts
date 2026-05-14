import {describe, expect, it, vi} from 'vitest';
import {OpenCodeRuntime} from '../src/lib/runtime.js';

describe('OpenCodeRuntime.runPrompt', () => {
  it('returns empty text when the assistant completes without text and empty output is allowed', async () => {
    const runtime = createRuntime({
      create: vi.fn().mockResolvedValue({
        data: {
          id: 'ses_empty_123'
        }
      }),
      prompt: vi.fn().mockResolvedValue({
        data: {
          info: {
            id: 'msg_empty_123'
          },
          parts: []
        }
      }),
      messages: vi.fn().mockResolvedValue({
        data: [
          {
            info: {
              role: 'assistant',
              time: {
                completed: '2026-05-13T21:00:00.000Z'
              },
              error: null
            },
            parts: [
              {
                type: 'step-finish',
                reason: 'completed'
              }
            ]
          }
        ]
      }),
      delete: vi.fn().mockResolvedValue({
        data: {}
      })
    });

    const result = await runtime.runPrompt({
      prompt: 'Apply the requested fix.',
      agent: 'shrike-fixer',
      model: 'azure/gpt-5.4',
      title: 'check-a fix',
      allowEmptyText: true
    });

    expect(result).toEqual({
      sessionId: 'ses_empty_123',
      text: ''
    });
  });

  it('respects a custom prompt timeout when provided', async () => {
    const sessionDelete = vi.fn().mockResolvedValue({
      data: {}
    });
    const runtime = createRuntime({
      create: vi.fn().mockResolvedValue({
        data: {
          id: 'ses_timeout_123'
        }
      }),
      prompt: vi.fn(({signal}: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {once: true});
        })
      ),
      messages: vi.fn(),
      delete: sessionDelete
    });

    await expect(runtime.runPrompt({
      prompt: 'Apply the requested fix.',
      agent: 'shrike-fixer',
      model: 'azure/gpt-5.4',
      title: 'check-a fix',
      requestTimeoutMs: 20
    })).rejects.toThrow('send OpenCode prompt timed out after 20ms.');

    expect(sessionDelete).toHaveBeenCalledOnce();
  });
});

function createRuntime(session: {
  create: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  messages: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}): OpenCodeRuntime {
  const runtime = Object.create(OpenCodeRuntime.prototype) as OpenCodeRuntime;
  const internals = runtime as unknown as {
    repoPath: string;
    client: {
      session: {
        create: typeof session.create;
        prompt: typeof session.prompt;
        messages: typeof session.messages;
        delete: typeof session.delete;
      };
    };
    closeServer: () => Promise<void>;
    streamAbortController: AbortController;
    streamTask: Promise<void>;
    onEvent: undefined;
    logger: null;
    sessionErrors: Map<string, string>;
    sessionMetadata: Map<string, {checkId?: string; workerId?: string}>;
  };

  internals.repoPath = '/workspace/repo';
  internals.client = {
    session
  };
  internals.closeServer = async () => undefined;
  internals.streamAbortController = new AbortController();
  internals.streamTask = Promise.resolve();
  internals.onEvent = undefined;
  internals.logger = null;
  internals.sessionErrors = new Map();
  internals.sessionMetadata = new Map();

  return runtime;
}
