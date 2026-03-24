import {createOpencode, type Config, type Event, type OpencodeClient} from '@opencode-ai/sdk';
import {ensureLocalNodeBinsOnPath} from './config.js';
import {extractAssistantTextFromParts} from './runtime-events.js';

export interface OpenCodeRuntimeOptions {
  repoPath: string;
  config: Config;
  onEvent?: ((event: Event) => void) | undefined;
}

export interface PromptResult {
  sessionId: string;
  text: string;
}

export class OpenCodeRuntime {
  private constructor(
    private readonly repoPath: string,
    private readonly client: OpencodeClient,
    private readonly closeServer: () => void,
    private readonly streamAbortController: AbortController,
    private readonly streamTask: Promise<void>,
    private readonly onEvent: ((event: Event) => void) | undefined
  ) {}

  static async create(options: OpenCodeRuntimeOptions): Promise<OpenCodeRuntime> {
    ensureLocalNodeBinsOnPath();

    const {client, server} = await createOpencode({
      config: options.config
    });

    const streamAbortController = new AbortController();
    const stream = await client.event.subscribe({
      query: {
        directory: options.repoPath
      },
      signal: streamAbortController.signal
    });

    const streamTask = (async () => {
      try {
        for await (const event of stream.stream) {
          options.onEvent?.(event);
          if (event.type === 'permission.updated') {
            await client.postSessionIdPermissionsPermissionId({
              path: {
                id: event.properties.sessionID,
                permissionID: event.properties.id
              },
              query: {
                directory: options.repoPath
              },
              body: {
                response: 'reject'
              }
            });
          }
        }
      } catch (error) {
        if (!streamAbortController.signal.aborted) {
          options.onEvent?.({
            type: 'session.error',
            properties: {
              error: {
                name: 'UnknownError',
                data: {
                  message: error instanceof Error ? error.message : String(error)
                }
              }
            }
          });
        }
      }
    })();

    return new OpenCodeRuntime(
      options.repoPath,
      client,
      server.close,
      streamAbortController,
      streamTask,
      options.onEvent
    );
  }

  async runPrompt(options: {
    prompt: string;
    agent: string;
    model: string;
    title: string;
  }): Promise<PromptResult> {
    const sessionResult = await this.client.session.create({
      query: {
        directory: this.repoPath
      },
      body: {
        title: options.title
      }
    });
    const session = unwrapSdkResult<NonNullable<typeof sessionResult.data>>(
      sessionResult,
      'Failed to create OpenCode session.'
    );

    try {
      const [providerID, modelID] = parseProviderModel(options.model);
      const responseResult = await this.client.session.prompt({
        path: {
          id: session.id
        },
        query: {
          directory: this.repoPath
        },
        body: {
          agent: options.agent,
          model: {
            providerID,
            modelID
          },
          parts: [
            {
              type: 'text',
              text: options.prompt
            }
          ]
        }
      });
      const response = unwrapSdkResult<NonNullable<typeof responseResult.data>>(
        responseResult,
        'OpenCode prompt failed.'
      );

      const text = extractAssistantTextFromParts(response.parts);
      if (!text) {
        throw new Error('opencode returned no text response.');
      }

      return {
        sessionId: session.id,
        text
      };
    } finally {
      try {
        await this.client.session.delete({
          path: {
            id: session.id
          },
          query: {
            directory: this.repoPath
          }
        });
      } catch (error) {
        this.onEvent?.({
          type: 'session.error',
          properties: {
            sessionID: session.id,
            error: {
              name: 'UnknownError',
              data: {
                message: error instanceof Error ? error.message : String(error)
              }
            }
          }
        });
      }
    }
  }

  async close(): Promise<void> {
    this.streamAbortController.abort();
    this.closeServer();
    await this.streamTask.catch(() => undefined);
  }
}

function parseProviderModel(model: string): [string, string] {
  const raw = model.trim();
  if (!raw.includes('/')) {
    throw new Error(
      `Model '${model}' must be in provider/model form when running via the OpenCode SDK.`
    );
  }

  const separatorIndex = raw.indexOf('/');
  return [raw.slice(0, separatorIndex), raw.slice(separatorIndex + 1)];
}

function unwrapSdkResult<T>(
  result: {data?: T | undefined; error?: unknown},
  fallbackMessage: string
): T {
  if (result.data !== undefined) {
    return result.data;
  }

  const errorMessage =
    typeof result.error === 'object' &&
    result.error !== null &&
    'data' in result.error &&
    typeof (result.error as {data?: {message?: string}}).data?.message === 'string'
      ? (result.error as {data: {message: string}}).data.message
      : fallbackMessage;

  throw new Error(errorMessage);
}
