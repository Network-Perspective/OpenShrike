#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const KEEPALIVE_INTERVAL_MS = 1_000;

await main();

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'serve':
      await runServe(args);
      return;
    case 'models':
      await runModels();
      return;
    case 'auth':
      if (args[0] === 'login') {
        await runAuthLogin();
        return;
      }
      break;
  }

  process.stderr.write(`Unsupported fake opencode command: ${[command, ...args].filter(Boolean).join(' ')}\n`);
  process.exitCode = 1;
}

async function runModels() {
  const models = readJsonEnv('FAKE_OPENCODE_MODELS_JSON', []);
  process.stdout.write(`${models.join('\n')}${models.length > 0 ? '\n' : ''}`);
}

async function runAuthLogin() {
  const authPath = process.env.FAKE_OPENCODE_AUTH_PATH;
  const configPath = process.env.FAKE_OPENCODE_CONFIG_PATH;
  const configContent = process.env.FAKE_OPENCODE_CONFIG_CONTENT_ON_AUTH_LOGIN;

  if (authPath) {
    await fs.mkdir(path.dirname(authPath), {recursive: true});
    await fs.writeFile(authPath, JSON.stringify({
      token: 'fake-auth-token'
    }, null, 2) + '\n', 'utf8');
  }

  if (configPath && configContent) {
    await fs.mkdir(path.dirname(configPath), {recursive: true});
    await fs.writeFile(configPath, `${configContent}\n`, 'utf8');
  }

  process.stdout.write('Fake OpenCode auth login complete.\n');
}

async function runServe(args) {
  const scenario = await loadScenario();
  const logPath = process.env.FAKE_OPENCODE_LOG_PATH ?? '';
  const port = parsePort(args);
  const sessions = new Map();
  const sseClients = new Set();
  let sessionCount = 0;
  let messageCount = 0;
  const promptPlans = Array.isArray(scenario.prompts)
    ? scenario.prompts.map(plan => ({...plan}))
    : [];

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (
        request.method === 'GET'
        && (url.pathname === '/event' || url.pathname === '/global/event')
      ) {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        response.write(': connected\n\n');
        const interval = setInterval(() => {
          response.write(': keepalive\n\n');
        }, KEEPALIVE_INTERVAL_MS);
        sseClients.add(interval);
        request.on('close', () => {
          clearInterval(interval);
          sseClients.delete(interval);
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/session') {
        const body = await readJsonBody(request);
        const sessionId = `ses_fake_${++sessionCount}`;
        sessions.set(sessionId, {
          id: sessionId,
          title: typeof body?.title === 'string' ? body.title : `session-${sessionCount}`,
          messages: []
        });
        await appendJsonLine(logPath, {
          type: 'session.create',
          sessionId,
          title: sessions.get(sessionId)?.title ?? null
        });
        writeJson(response, 200, {
          id: sessionId
        });
        return;
      }

      const promptMatch = matchPath(url.pathname, /^\/session\/([^/]+)\/message$/);
      if (request.method === 'POST' && promptMatch) {
        const sessionId = promptMatch[1];
        const session = sessions.get(sessionId);
        if (!session) {
          writeJson(response, 404, {
            data: {
              message: `Unknown fake session '${sessionId}'.`
            }
          });
          return;
        }

        const body = await readJsonBody(request);
        const promptText = extractPromptText(body);
        const promptPlan = promptPlans.shift();
        if (!promptPlan) {
          writeJson(response, 500, {
            data: {
              message: 'No fake prompt plan is available.'
            }
          });
          return;
        }

        if (typeof promptPlan.title === 'string' && promptPlan.title !== session.title) {
          writeJson(response, 500, {
            data: {
              message: `Expected title '${promptPlan.title}', received '${session.title}'.`
            }
          });
          return;
        }

        if (Array.isArray(promptPlan.promptIncludes)) {
          for (const expectedText of promptPlan.promptIncludes) {
            if (typeof expectedText === 'string' && !promptText.includes(expectedText)) {
              writeJson(response, 500, {
                data: {
                  message: `Prompt for '${session.title}' did not include '${expectedText}'.`
                }
              });
              return;
            }
          }
        }

        if (promptPlan.mutateFile?.path && typeof promptPlan.mutateFile.content === 'string') {
          await fs.mkdir(path.dirname(promptPlan.mutateFile.path), {recursive: true});
          await fs.writeFile(promptPlan.mutateFile.path, promptPlan.mutateFile.content, 'utf8');
        }

        const messageId = `msg_fake_${++messageCount}`;
        const assistantMessage = createAssistantMessage({
          sessionId,
          messageId,
          text: typeof promptPlan.responseText === 'string' ? promptPlan.responseText : ''
        });
        session.messages.push(assistantMessage);

        await appendJsonLine(logPath, {
          type: 'session.prompt',
          sessionId,
          title: session.title,
          directory: url.searchParams.get('directory'),
          agent: body?.agent ?? null,
          model: body?.model ?? null,
          promptText,
          body
        });

        writeJson(response, 200, assistantMessage);
        return;
      }

      const messagesMatch = matchPath(url.pathname, /^\/session\/([^/]+)\/message$/);
      if (request.method === 'GET' && messagesMatch) {
        const session = sessions.get(messagesMatch[1]);
        if (!session) {
          writeJson(response, 404, {
            data: {
              message: `Unknown fake session '${messagesMatch[1]}'.`
            }
          });
          return;
        }

        writeJson(response, 200, session.messages);
        return;
      }

      const deleteMatch = matchPath(url.pathname, /^\/session\/([^/]+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        sessions.delete(deleteMatch[1]);
        writeJson(response, 200, {});
        return;
      }

      const permissionMatch = matchPath(url.pathname, /^\/session\/([^/]+)\/permissions\/([^/]+)$/);
      if (request.method === 'POST' && permissionMatch) {
        writeJson(response, 200, {});
        return;
      }

      writeJson(response, 404, {
        data: {
          message: `Unsupported fake OpenCode path '${url.pathname}'.`
        }
      });
    } catch (error) {
      writeJson(response, 500, {
        data: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  process.stdout.write(`opencode server listening on http://127.0.0.1:${port}\n`);

  const shutdown = async () => {
    for (const interval of sseClients) {
      clearInterval(interval);
    }

    await new Promise(resolve => {
      server.close(() => resolve());
    });
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

function parsePort(args) {
  const portArg = args.find(argument => argument.startsWith('--port='));
  const parsed = Number.parseInt(portArg?.slice('--port='.length) ?? '', 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Fake OpenCode serve did not receive a valid --port argument: ${args.join(' ')}`);
  }

  return parsed;
}

async function loadScenario() {
  const scenarioPath = process.env.FAKE_OPENCODE_SCENARIO_PATH;
  if (!scenarioPath) {
    return {};
  }

  return JSON.parse(await fs.readFile(scenarioPath, 'utf8'));
}

function createAssistantMessage(options) {
  const info = {
    id: options.messageId,
    sessionID: options.sessionId,
    role: 'assistant',
    error: null,
    time: {
      completed: new Date().toISOString()
    }
  };

  const parts = options.text
    ? [
        {
          id: `${options.messageId}_part_1`,
          sessionID: options.sessionId,
          messageID: options.messageId,
          type: 'text',
          text: options.text
        }
      ]
    : [];

  return {
    info,
    parts
  };
}

function extractPromptText(body) {
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  return parts
    .map(part => part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n');
}

async function readJsonBody(request) {
  const raw = await readBody(request);
  return raw.trim() ? JSON.parse(raw) : null;
}

async function readBody(request) {
  let body = '';

  for await (const chunk of request) {
    body += chunk.toString();
  }

  return body;
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

function matchPath(pathname, pattern) {
  const match = pathname.match(pattern);
  return match;
}

async function appendJsonLine(logPath, value) {
  if (!logPath) {
    return;
  }

  await fs.mkdir(path.dirname(logPath), {recursive: true});
  await fs.appendFile(logPath, `${JSON.stringify(value)}\n`, 'utf8');
}

function readJsonEnv(name, fallbackValue) {
  const raw = process.env[name];
  if (!raw) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}
