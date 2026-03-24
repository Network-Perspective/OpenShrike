import type {Event, Part} from '@opencode-ai/sdk';
import {STREAM_EVENT_LIMIT, STREAM_TEXT_LIMIT} from './constants.js';

export interface RuntimeStreamState {
  entries: string[];
  output: string;
  reasoning: string;
}

export function createRuntimeStreamState(): RuntimeStreamState {
  return {
    entries: [],
    output: '',
    reasoning: ''
  };
}

export function reduceRuntimeEvent(
  state: RuntimeStreamState,
  event: Event
): RuntimeStreamState {
  const next: RuntimeStreamState = {
    entries: [...state.entries],
    output: state.output,
    reasoning: state.reasoning
  };

  switch (event.type) {
    case 'message.updated': {
      if (event.properties.info.role === 'assistant') {
        pushEntry(
          next,
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
        pushEntry(next, `session retry ${status.attempt}: ${status.message}`);
      } else {
        pushEntry(next, `session ${status.type}`);
      }
      break;
    }
    case 'permission.updated': {
      pushEntry(next, `permission requested: ${event.properties.title}`);
      break;
    }
    case 'permission.replied': {
      pushEntry(next, `permission ${event.properties.permissionID}: ${event.properties.response}`);
      break;
    }
    case 'command.executed': {
      pushEntry(next, `command ${event.properties.name} ${event.properties.arguments}`.trim());
      break;
    }
    case 'session.error': {
      pushEntry(next, `session error: ${event.properties.error?.data.message ?? 'unknown error'}`);
      break;
    }
    case 'todo.updated': {
      pushEntry(next, `todos updated: ${event.properties.todos.length}`);
      break;
    }
    case 'pty.created': {
      pushEntry(next, `pty started: ${event.properties.info.title}`);
      break;
    }
    case 'pty.exited': {
      pushEntry(next, `pty exited: ${event.properties.id} (${event.properties.exitCode})`);
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
      state.output = trimTail(state.output + (delta ?? part.text));
      break;
    }
    case 'reasoning': {
      state.reasoning = trimTail(state.reasoning + (delta ?? part.text));
      break;
    }
    case 'tool': {
      const detail =
        part.state.status === 'running'
          ? `${part.tool} running`
          : part.state.status === 'completed'
            ? `${part.tool} completed`
            : part.state.status === 'error'
              ? `${part.tool} error`
              : `${part.tool} pending`;
      pushEntry(state, detail);
      break;
    }
    case 'agent': {
      pushEntry(state, `agent ${part.name}`);
      break;
    }
    case 'subtask': {
      pushEntry(state, `subtask ${part.agent}: ${part.description}`);
      break;
    }
    case 'step-start': {
      pushEntry(state, 'step started');
      break;
    }
    case 'step-finish': {
      pushEntry(state, `step finished (${part.reason})`);
      break;
    }
    case 'retry': {
      pushEntry(state, `retry ${part.attempt}: ${part.error.data.message}`);
      break;
    }
    case 'patch': {
      pushEntry(state, `patch touched ${part.files.length} file(s)`);
      break;
    }
    case 'compaction': {
      pushEntry(state, part.auto ? 'auto compaction' : 'manual compaction');
      break;
    }
    default:
      break;
  }
}

function pushEntry(state: RuntimeStreamState, entry: string): void {
  const normalized = entry.trim();
  if (!normalized) {
    return;
  }

  state.entries.push(normalized);
  if (state.entries.length > STREAM_EVENT_LIMIT) {
    state.entries.splice(0, state.entries.length - STREAM_EVENT_LIMIT);
  }
}

function trimTail(value: string): string {
  if (value.length <= STREAM_TEXT_LIMIT) {
    return value;
  }

  return value.slice(value.length - STREAM_TEXT_LIMIT);
}
