import crypto from 'node:crypto';
import net from 'node:net';
import {
  type AssistantMessage,
  type Event,
  type Message,
  type OpencodeClient,
  type Part
} from '@opencode-ai/sdk';
import {ensureLocalNodeBinsOnPath} from './config.js';
import {
  OPENCODE_DELETE_TIMEOUT_MS,
  OPENCODE_POLL_TIMEOUT_MS,
  OPENCODE_REQUEST_TIMEOUT_MS
} from './constants.js';
import {createManagedOpencodeServer} from './opencode-server.js';
import {extractAssistantTextFromParts} from './runtime-events.js';
import type {ScanLogger} from './scan-log.js';

export interface RuntimeSessionMetadata {
  checkId?: string | undefined;
  workerId?: string | undefined;
}

export interface RuntimeEventEnvelope {
  event: Event;
  sessionId: string | null;
  checkId: string | null;
  workerId: string | null;
}

export interface OpenCodeRuntimeOptions {
  repoPath: string;
  config: import('@opencode-ai/sdk').Config;
  onEvent?: ((event: RuntimeEventEnvelope) => void) | undefined;
  logger?: ScanLogger | null;
}

export interface PromptResult {
  sessionId: string;
  text: string;
}

export class OpenCodeRuntime {
  private constructor(
    private readonly repoPath: string,
    private readonly client: OpencodeClient,
    private readonly closeServer: () => Promise<void>,
    private readonly streamAbortController: AbortController,
    private readonly streamTask: Promise<void>,
    private readonly onEvent: ((event: RuntimeEventEnvelope) => void) | undefined,
    private readonly logger: ScanLogger | null,
    private readonly sessionErrors: Map<string, string>,
    private readonly sessionMetadata: Map<string, RuntimeSessionMetadata>
  ) {}

  static async create(options: OpenCodeRuntimeOptions): Promise<OpenCodeRuntime> {
    ensureLocalNodeBinsOnPath();
    const port = await findAvailablePort();
    const server = await createManagedOpencodeServer({
      config: options.config,
      port,
      logger: options.logger ?? null
    });
    options.logger?.write('runtime.created', {
      repoPath: options.repoPath,
      port,
      pid: server.pid ?? null
    });

    const streamAbortController = new AbortController();
    const sessionErrors = new Map<string, string>();
    const sessionMetadata = new Map<string, RuntimeSessionMetadata>();
    try {
      const stream = await server.client.event.subscribe({
        query: {
          directory: options.repoPath
        },
        signal: streamAbortController.signal
      });
      options.logger?.write('runtime.stream.subscribed', {
        repoPath: options.repoPath
      });

      const streamTask = (async () => {
        try {
          for await (const event of stream.stream) {
            if (event.type === 'session.error' && event.properties.sessionID) {
              sessionErrors.set(
                event.properties.sessionID,
                getErrorMessage(event.properties.error, 'Unknown OpenCode session error.')
              );
            }
            options.onEvent?.(createRuntimeEventEnvelope(event, sessionMetadata));
            if (event.type === 'permission.updated') {
              await withTimeoutSignal(
                OPENCODE_DELETE_TIMEOUT_MS,
                'reply to OpenCode permission request',
                signal =>
                  server.client.postSessionIdPermissionsPermissionId({
                    path: {
                      id: event.properties.sessionID,
                      permissionID: event.properties.id
                    },
                    query: {
                      directory: options.repoPath
                    },
                    body: {
                      response: 'reject'
                    },
                    signal
                  })
              );
            }
          }
        } catch (error) {
          if (!streamAbortController.signal.aborted) {
            options.onEvent?.(
              createRuntimeEventEnvelope(
                {
                  type: 'session.error',
                  properties: {
                    error: {
                      name: 'UnknownError',
                      data: {
                        message: error instanceof Error ? error.message : String(error)
                      }
                    }
                  }
                },
                sessionMetadata
              )
            );
          }
        }
      })();

      return new OpenCodeRuntime(
        options.repoPath,
        server.client,
        server.close,
        streamAbortController,
        streamTask,
        options.onEvent,
        options.logger ?? null,
        sessionErrors,
        sessionMetadata
      );
    } catch (error) {
      await server.close().catch(() => undefined);
      throw error;
    }
  }

  async runPrompt(options: {
    prompt: string;
    agent: string;
    model: string;
    title: string;
    checkId?: string | undefined;
    workerId?: string | undefined;
    allowEmptyText?: boolean | undefined;
    requestTimeoutMs?: number | undefined;
    completionTimeoutMs?: number | undefined;
  }): Promise<PromptResult> {
    const sessionResult = await withTimeoutSignal(
      OPENCODE_REQUEST_TIMEOUT_MS,
      'create OpenCode session',
      signal =>
        this.client.session.create({
          query: {
            directory: this.repoPath
          },
          body: {
            title: options.title
          },
          signal
        })
    );
    const session = unwrapSdkResult<NonNullable<typeof sessionResult.data>>(
      sessionResult,
      'Failed to create OpenCode session.'
    );
    this.logger?.write('prompt.session.created', {
      sessionId: session.id,
      title: options.title
    });
    this.sessionMetadata.set(session.id, {
      checkId: options.checkId,
      workerId: options.workerId
    });

    try {
      const [providerID, modelID] = parseProviderModel(options.model);
      this.logger?.write('prompt.started', {
        sessionId: session.id,
        agent: options.agent,
        providerID,
        modelID,
        title: options.title,
        requestTimeoutMs: options.requestTimeoutMs ?? OPENCODE_REQUEST_TIMEOUT_MS,
        completionTimeoutMs: options.completionTimeoutMs ?? OPENCODE_POLL_TIMEOUT_MS,
        promptLength: options.prompt.length,
        promptSha256: crypto.createHash('sha256').update(options.prompt).digest('hex').slice(0, 16)
      });
      const responseResult = await withTimeoutSignal(
        options.requestTimeoutMs ?? OPENCODE_REQUEST_TIMEOUT_MS,
        'send OpenCode prompt',
        signal =>
          this.client.session.prompt({
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
            },
            signal
          })
      );
      const response = unwrapSdkResult<NonNullable<typeof responseResult.data>>(
        responseResult,
        'OpenCode prompt failed.'
      );

      let text = extractAssistantTextFromParts(response.parts);
      this.logger?.write('prompt.response', {
        sessionId: session.id,
        messageId: response.info.id,
        partCount: response.parts.length,
        partTypes: response.parts.map(part => part.type),
        inlineAssistantTextLength: text.length
      });

      text = await this.waitForPromptCompletion(
        session.id,
        text,
        options.allowEmptyText ?? false,
        options.completionTimeoutMs ?? OPENCODE_POLL_TIMEOUT_MS
      );

      return {
        sessionId: session.id,
        text
      };
    } finally {
      this.sessionErrors.delete(session.id);
      try {
        await withTimeoutSignal(
          OPENCODE_DELETE_TIMEOUT_MS,
          'delete OpenCode session',
          signal =>
            this.client.session.delete({
              path: {
                id: session.id
              },
              query: {
                directory: this.repoPath
              },
              signal
            })
        );
        this.logger?.write('prompt.session.deleted', {
          sessionId: session.id
        });
      } catch (error) {
        this.onEvent?.({
          event: {
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
          },
          sessionId: session.id,
          checkId: this.sessionMetadata.get(session.id)?.checkId ?? null,
          workerId: this.sessionMetadata.get(session.id)?.workerId ?? null
        });
        this.logger?.write('prompt.session.delete_failed', {
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        this.sessionMetadata.delete(session.id);
      }
    }
  }

  async close(): Promise<void> {
    this.streamAbortController.abort();
    await this.streamTask.catch(() => undefined);
    await this.closeServer();
    this.logger?.write('runtime.closed');
  }

  private async waitForPromptCompletion(
    sessionId: string,
    initialText: string,
    allowEmptyText: boolean,
    timeoutMs: number
  ): Promise<string> {
    const startedAt = Date.now();
    let attempt = 0;
    let latestText = initialText;

    while (Date.now() - startedAt < timeoutMs) {
      attempt += 1;
      const remainingMs = Math.max(
        1_000,
        Math.min(OPENCODE_REQUEST_TIMEOUT_MS, timeoutMs - (Date.now() - startedAt))
      );
      const messagesResult = await withTimeoutSignal(
        remainingMs,
        'read OpenCode session messages',
        signal =>
          this.client.session.messages({
            path: {
              id: sessionId
            },
            query: {
              directory: this.repoPath
            },
            signal
          })
      );
      const messages = unwrapSdkResult<NonNullable<typeof messagesResult.data>>(
        messagesResult,
        'Failed to read OpenCode session messages.'
      );

      const latestAssistantMessage = getLatestAssistantMessage(messages);
      const text = latestAssistantMessage ? extractAssistantTextFromParts(latestAssistantMessage.parts) : '';
      const completed = Boolean(latestAssistantMessage?.info.time.completed);
      const messageError = latestAssistantMessage
        ? getErrorMessage(latestAssistantMessage.info.error, '')
        : '';

      if (text) {
        latestText = text;
      }

      this.logger?.write('prompt.wait.iteration', {
        sessionId,
        attempt,
        messageCount: messages.length,
        assistantMessageCount: messages.filter(message => message.info.role === 'assistant').length,
        latestAssistantPartTypes: latestAssistantMessage?.parts.map(part => part.type) ?? [],
        latestAssistantTextLength: text.length,
        latestAssistantCompleted: completed,
        latestAssistantError: messageError ?? null,
        sessionError: this.sessionErrors.get(sessionId) ?? null
      });

      if (messageError) {
        throw new Error(messageError);
      }

      const sessionError = this.sessionErrors.get(sessionId);
      if (sessionError) {
        throw new Error(sessionError);
      }

      if (completed) {
        if (latestText) {
          return latestText;
        }

        if (allowEmptyText) {
          return '';
        }

        throw new Error('OpenCode completed the prompt without any assistant text output.');
      }

      await delay(500);
    }

    if (latestText) {
      return latestText;
    }

    throw new Error(`Timed out waiting for OpenCode assistant response for session '${sessionId}'.`);
  }
}

function createRuntimeEventEnvelope(
  event: Event,
  sessionMetadata: Map<string, RuntimeSessionMetadata>
): RuntimeEventEnvelope {
  const sessionId = getEventSessionId(event);
  const metadata = sessionId ? sessionMetadata.get(sessionId) : null;
  return {
    event,
    sessionId,
    checkId: metadata?.checkId ?? null,
    workerId: metadata?.workerId ?? null
  };
}

function getEventSessionId(event: Event): string | null {
  const runtimeEvent = event as {type: string; properties?: Record<string, unknown>};

  switch (runtimeEvent.type) {
    case 'message.part.delta':
      return (runtimeEvent.properties as {sessionID?: string} | undefined)?.sessionID ?? null;
    case 'message.part.updated':
      return (runtimeEvent.properties as {part?: {sessionID?: string}} | undefined)?.part?.sessionID ?? null;
    case 'message.updated':
      return (runtimeEvent.properties as {info?: {sessionID?: string}} | undefined)?.info?.sessionID ?? null;
    case 'session.status':
      return (runtimeEvent.properties as {sessionID?: string} | undefined)?.sessionID ?? null;
    case 'permission.updated':
      return (runtimeEvent.properties as {sessionID?: string} | undefined)?.sessionID ?? null;
    case 'permission.replied':
      return (runtimeEvent.properties as {sessionID?: string} | undefined)?.sessionID ?? null;
    case 'session.error':
      return (runtimeEvent.properties as {sessionID?: string} | undefined)?.sessionID ?? null;
    default:
      return null;
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeoutSignal<T>(
  timeoutMs: number,
  operation: string,
  callback: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`${operation} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  try {
    return await callback(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) {
      throw controller.signal.reason;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate an OpenCode server port.')));
        return;
      }

      const {port} = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function getLatestAssistantMessage(
  messages: Array<{
    info: Message;
    parts: Part[];
  }>
): {info: AssistantMessage; parts: Part[]} | undefined {
  for (const message of [...messages].reverse()) {
    if (message.info.role === 'assistant') {
      return {
        info: message.info,
        parts: message.parts
      };
    }
  }

  return undefined;
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as {data?: {message?: unknown}}).data?.message === 'string'
  ) {
    return (error as {data: {message: string}}).data.message;
  }

  return fallbackMessage;
}
