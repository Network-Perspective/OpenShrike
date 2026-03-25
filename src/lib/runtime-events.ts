import type {Event, Part} from '@opencode-ai/sdk';
import {STREAM_EVENT_LIMIT, STREAM_TEXT_LIMIT} from './constants.js';

export type RuntimeStreamItemKind =
  | 'event'
  | 'assistant'
  | 'reasoning'
  | 'tool'
  | 'tool-output'
  | 'pty'
  | 'error';

export interface RuntimeStreamItem {
  kind: RuntimeStreamItemKind;
  text: string;
}

export interface RuntimeStreamState {
  items: RuntimeStreamItem[];
  partSnapshots: Record<string, string>;
  toolSnapshots: Record<string, string>;
  ptySnapshots: Record<string, string>;
}

export function createRuntimeStreamState(): RuntimeStreamState {
  return {
    items: [],
    partSnapshots: {},
    toolSnapshots: {},
    ptySnapshots: {}
  };
}

export function reduceRuntimeEvent(
  state: RuntimeStreamState,
  event: Event
): RuntimeStreamState {
  const next: RuntimeStreamState = {
    items: state.items.map(item => ({...item})),
    partSnapshots: {...state.partSnapshots},
    toolSnapshots: {...state.toolSnapshots},
    ptySnapshots: {...state.ptySnapshots}
  };

  switch (event.type) {
    case 'message.updated': {
      if (event.properties.info.role === 'assistant') {
        pushItem(
          next,
          'event',
          `assistant ${event.properties.info.providerID}/${event.properties.info.modelID}`
        );
      }
      break;
    }
    case 'message.part.updated': {
      applyPartEvent(next, event.properties.part, event.properties.delta);
      break;
    }
    case 'session.status': {
      const status = event.properties.status;
      if (status.type === 'retry') {
        pushItem(next, 'event', `session retry ${status.attempt}: ${status.message}`);
      } else {
        pushItem(next, 'event', `session ${status.type}`);
      }
      break;
    }
    case 'permission.updated': {
      pushItem(next, 'event', `permission requested: ${event.properties.title}`);
      break;
    }
    case 'permission.replied': {
      pushItem(next, 'event', `permission ${event.properties.permissionID}: ${event.properties.response}`);
      break;
    }
    case 'command.executed': {
      pushItem(next, 'tool', `command ${event.properties.name} ${event.properties.arguments}`.trim());
      break;
    }
    case 'session.error': {
      pushItem(next, 'error', `session error: ${event.properties.error?.data.message ?? 'unknown error'}`);
      break;
    }
    case 'todo.updated': {
      pushItem(next, 'event', `todos updated: ${event.properties.todos.length}`);
      break;
    }
    case 'pty.created': {
      const summary = formatPtySummary(event.properties.info.command, event.properties.info.args);
      next.ptySnapshots[event.properties.info.id] = summary;
      pushItem(
        next,
        'pty',
        `${event.properties.info.title}: ${summary} [cwd ${event.properties.info.cwd}]`
      );
      break;
    }
    case 'pty.updated': {
      const summary = formatPtySummary(event.properties.info.command, event.properties.info.args);
      if (next.ptySnapshots[event.properties.info.id] !== summary) {
        next.ptySnapshots[event.properties.info.id] = summary;
        pushItem(
          next,
          'pty',
          `${event.properties.info.title}: ${summary} [cwd ${event.properties.info.cwd}]`
        );
      }
      break;
    }
    case 'pty.exited': {
      const summary = next.ptySnapshots[event.properties.id] ?? event.properties.id;
      pushItem(next, 'pty', `process exited (${event.properties.exitCode}): ${summary}`);
      break;
    }
    default:
      break;
  }

  return next;
}

export function extractAssistantTextFromParts(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, {type: 'text'}> => part.type === 'text')
    .map(part => part.text)
    .join('')
    .trim();
}

function applyPartEvent(state: RuntimeStreamState, part: Part, delta?: string): void {
  switch (part.type) {
    case 'text': {
      appendStreamingPart(state, part.id, 'assistant', delta ?? part.text, part.text);
      break;
    }
    case 'reasoning': {
      appendStreamingPart(state, part.id, 'reasoning', delta ?? part.text, part.text);
      break;
    }
    case 'tool': {
      applyToolPart(state, part);
      break;
    }
    case 'agent': {
      pushItem(state, 'event', `agent ${part.name}`);
      break;
    }
    case 'subtask': {
      pushItem(state, 'event', `subtask ${part.agent}: ${part.description}`);
      break;
    }
    case 'step-start': {
      pushItem(state, 'event', 'step started');
      break;
    }
    case 'step-finish': {
      pushItem(state, 'event', `step finished (${part.reason})`);
      break;
    }
    case 'retry': {
      pushItem(state, 'error', `retry ${part.attempt}: ${part.error.data.message}`);
      break;
    }
    case 'patch': {
      pushItem(state, 'event', `patch touched ${part.files.length} file(s)`);
      break;
    }
    case 'compaction': {
      pushItem(state, 'event', part.auto ? 'auto compaction' : 'manual compaction');
      break;
    }
    default:
      break;
  }
}

function appendStreamingPart(
  state: RuntimeStreamState,
  partId: string,
  kind: Extract<RuntimeStreamItemKind, 'assistant' | 'reasoning'>,
  fallbackText: string,
  fullText: string
): void {
  const previousText = state.partSnapshots[partId] ?? '';
  state.partSnapshots[partId] = fullText;

  const delta = fullText.startsWith(previousText)
    ? fullText.slice(previousText.length)
    : previousText.length === 0
      ? fallbackText
      : fullText;

  pushItem(state, kind, delta);
}

function applyToolPart(
  state: RuntimeStreamState,
  part: Extract<Part, {type: 'tool'}>
): void {
  const title = summarizeToolInvocation(part.tool, part.state);
  const statusLabel = `${part.tool} ${part.state.status}${title ? `: ${title}` : ''}`;
  const outputSummary = part.state.status === 'completed' ? summarizeToolOutput(part.state.output) : '';
  const errorSummary = part.state.status === 'error' ? part.state.error.trim() : '';
  const snapshot = JSON.stringify({
    statusLabel,
    outputSummary,
    errorSummary
  });

  if (state.toolSnapshots[part.id] === snapshot) {
    return;
  }

  state.toolSnapshots[part.id] = snapshot;
  pushItem(state, 'tool', statusLabel);

  if (outputSummary) {
    pushItem(state, 'tool-output', outputSummary);
  }

  if (errorSummary) {
    pushItem(state, 'error', errorSummary);
  }
}

function pushItem(state: RuntimeStreamState, kind: RuntimeStreamItemKind, text: string): void {
  const normalized = normalizeText(text);
  if (!normalized.trim()) {
    return;
  }

  const lastItem = state.items[state.items.length - 1];
  if ((kind === 'assistant' || kind === 'reasoning') && lastItem?.kind === kind) {
    lastItem.text = trimTail(`${lastItem.text}${normalized}`);
    return;
  }

  state.items.push({
    kind,
    text: normalized
  });
  if (state.items.length > STREAM_EVENT_LIMIT) {
    state.items.splice(0, state.items.length - STREAM_EVENT_LIMIT);
  }
}

function summarizeToolInvocation(
  tool: string,
  state: Extract<Part, {type: 'tool'}>['state']
): string {
  if ('title' in state && typeof state.title === 'string' && state.title.trim()) {
    return truncateText(state.title.trim(), 140);
  }

  if ('raw' in state && typeof state.raw === 'string' && state.raw.trim()) {
    return truncateText(state.raw.trim(), 140);
  }

  const inputSummary = summarizeUnknownValue(state.input);
  if (inputSummary) {
    return inputSummary;
  }

  return tool === 'bash' ? 'shell command' : '';
}

function summarizeUnknownValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return truncateText(value.trim(), 140);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .filter((entry): entry is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof entry))
      .map(entry => String(entry))
      .join(' ');
    return truncateText(joined, 140);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = ['command', 'cmd', 'expression', 'path', 'query', 'q', 'url', 'title'];

    for (const key of preferredKeys) {
      const entry = record[key];
      const summary = summarizeUnknownValue(entry);
      if (summary) {
        return summary;
      }
    }

    if (Array.isArray(record.args)) {
      const args = summarizeUnknownValue(record.args);
      if (args) {
        return args;
      }
    }

    const compactJson = JSON.stringify(record);
    return compactJson === '{}' ? '' : truncateText(compactJson, 140);
  }

  return truncateText(String(value), 140);
}

function summarizeToolOutput(output: string): string {
  const normalized = normalizeText(output).trim();
  if (!normalized) {
    return '';
  }

  const lines = normalized.split('\n');
  const excerpt = lines.slice(0, 3).map(line => truncateText(line, 160)).join('\n');
  return lines.length > 3 ? `${excerpt}\n...` : excerpt;
}

function formatPtySummary(command: string, args: string[]): string {
  const parts = [command, ...args].filter(Boolean).map(quoteIfNeeded);
  return truncateText(parts.join(' '), 160);
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function trimTail(value: string): string {
  if (value.length <= STREAM_TEXT_LIMIT) {
    return value;
  }

  return value.slice(value.length - STREAM_TEXT_LIMIT);
}
