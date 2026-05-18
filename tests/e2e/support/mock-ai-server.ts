import http from 'node:http';
import type {AddressInfo} from 'node:net';

export interface MockAiRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  bodyRaw: string;
  body: Record<string, unknown> | null;
  promptText: string;
}

interface QueuedTextResponse {
  text: string;
  statusCode: number;
  delayMs: number;
}

interface MatchedTextResponse extends QueuedTextResponse {
  match:
    | string
    | RegExp
    | ((request: MockAiRequest) => boolean);
}

export class MockAiServer {
  readonly requests: MockAiRequest[] = [];
  private readonly queuedResponses: QueuedTextResponse[] = [];
  private readonly matchedResponses: MatchedTextResponse[] = [];
  private readonly server: http.Server;
  private responseCount = 0;
  baseUrl = '';

  private constructor() {
    this.server = http.createServer(async (request, response) => {
      const bodyRaw = await readRequestBody(request);
      const parsedBody = parseRequestBody(bodyRaw);
      const normalizedRequest: MockAiRequest = {
        method: request.method ?? 'GET',
        path: request.url ?? '/',
        headers: request.headers,
        bodyRaw,
        body: parsedBody,
        promptText: extractPromptText(parsedBody)
      };
      this.requests.push(normalizedRequest);

      if (request.url !== '/v1/responses') {
        response.writeHead(404, {'content-type': 'application/json'});
        response.end(JSON.stringify({
          error: {
            message: `Unsupported mock AI path '${request.url ?? '/'}'.`
          }
        }));
        return;
      }

      const nextResponse = this.shiftNextResponse(normalizedRequest);
      if (!nextResponse) {
        response.writeHead(500, {'content-type': 'application/json'});
        response.end(JSON.stringify({
          error: {
            message: 'No queued mock AI response is available.'
          }
        }));
        return;
      }

      if (nextResponse.delayMs > 0) {
        await delay(nextResponse.delayMs);
      }

      if (nextResponse.statusCode >= 400) {
        response.writeHead(nextResponse.statusCode, {'content-type': 'application/json'});
        response.end(JSON.stringify({
          error: {
            message: nextResponse.text
          }
        }));
        return;
      }

      const model = typeof parsedBody?.model === 'string' ? parsedBody.model : 'gpt-4o-mini';
      const streamEvents = buildResponsesStreamEvents({
        model,
        text: nextResponse.text,
        responseId: `resp_mock_${++this.responseCount}`,
        itemId: `msg_mock_${this.responseCount}`
      });

      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });

      for (const event of streamEvents) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      response.end();
    });
  }

  static async start(): Promise<MockAiServer> {
    const server = new MockAiServer();
    await new Promise<void>((resolve, reject) => {
      server.server.once('error', reject);
      server.server.listen(0, '127.0.0.1', () => {
        server.server.off('error', reject);
        resolve();
      });
    });

    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Mock AI server did not bind to a TCP address.');
    }

    server.baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    return server;
  }

  enqueueTextResponse(text: string, options?: {
    statusCode?: number;
    delayMs?: number;
  }): void {
    this.queuedResponses.push({
      text,
      statusCode: options?.statusCode ?? 200,
      delayMs: options?.delayMs ?? 0
    });
  }

  enqueueMatchedTextResponse(
    match: MatchedTextResponse['match'],
    text: string,
    options?: {
      statusCode?: number;
      delayMs?: number;
    }
  ): void {
    this.matchedResponses.push({
      match,
      text,
      statusCode: options?.statusCode ?? 200,
      delayMs: options?.delayMs ?? 0
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private shiftNextResponse(request: MockAiRequest): QueuedTextResponse | undefined {
    const matchedIndex = this.matchedResponses.findIndex(candidate => {
      if (typeof candidate.match === 'string') {
        return request.promptText.includes(candidate.match);
      }

      if (candidate.match instanceof RegExp) {
        return candidate.match.test(request.promptText);
      }

      return candidate.match(request);
    });

    if (matchedIndex >= 0) {
      return this.matchedResponses.splice(matchedIndex, 1)[0];
    }

    return this.queuedResponses.shift();
  }
}

function buildResponsesStreamEvents(options: {
  model: string;
  text: string;
  responseId: string;
  itemId: string;
}): Array<Record<string, unknown>> {
  const createdAt = Math.floor(Date.now() / 1_000);
  const completedResponse = {
    id: options.responseId,
    object: 'response',
    created_at: createdAt,
    status: 'completed',
    model: options.model,
    output: [
      {
        id: options.itemId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: options.text,
            annotations: []
          }
        ]
      }
    ],
    usage: {
      input_tokens: 1,
      output_tokens: Math.max(1, options.text.length),
      total_tokens: Math.max(2, options.text.length + 1)
    }
  };

  return [
    {
      type: 'response.created',
      response: {
        id: options.responseId,
        object: 'response',
        created_at: createdAt,
        status: 'in_progress',
        model: options.model,
        output: []
      }
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        id: options.itemId,
        type: 'message',
        status: 'in_progress',
        role: 'assistant',
        content: []
      }
    },
    {
      type: 'response.content_part.added',
      item_id: options.itemId,
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: '',
        annotations: []
      }
    },
    {
      type: 'response.output_text.delta',
      item_id: options.itemId,
      output_index: 0,
      content_index: 0,
      delta: options.text
    },
    {
      type: 'response.output_text.done',
      item_id: options.itemId,
      output_index: 0,
      content_index: 0,
      text: options.text,
      annotations: []
    },
    {
      type: 'response.content_part.done',
      item_id: options.itemId,
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: options.text,
        annotations: []
      }
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        id: options.itemId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: options.text,
            annotations: []
          }
        ]
      }
    },
    {
      type: 'response.completed',
      response: completedResponse
    }
  ];
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  let body = '';

  for await (const chunk of request) {
    body += chunk.toString();
  }

  return body;
}

function parseRequestBody(bodyRaw: string): Record<string, unknown> | null {
  if (!bodyRaw.trim()) {
    return null;
  }

  return JSON.parse(bodyRaw) as Record<string, unknown>;
}

function extractPromptText(body: Record<string, unknown> | null): string {
  const input = Array.isArray(body?.input) ? body.input : [];
  const lastEntry = input[input.length - 1];
  if (!lastEntry || typeof lastEntry !== 'object') {
    return '';
  }

  const content = Array.isArray((lastEntry as {content?: unknown}).content)
    ? (lastEntry as {content: Array<Record<string, unknown>>}).content
    : [];

  return content
    .map(item => {
      if (typeof item?.text === 'string') {
        return item.text;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
