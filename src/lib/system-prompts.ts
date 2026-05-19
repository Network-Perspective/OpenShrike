import fs from 'node:fs/promises';
import path from 'node:path';
import {findToolRoot} from './project-root.js';

type SystemPromptKind = 'scan' | 'fix';

const SYSTEM_PROMPT_FILES: Record<SystemPromptKind, string> = {
  scan: 'scan-system.md',
  fix: 'fix-system.md'
};

const systemPromptCache = new Map<SystemPromptKind, Promise<string>>();

export async function loadScanSystemPrompt(): Promise<string> {
  return await loadSystemPrompt('scan');
}

export async function loadFixSystemPrompt(): Promise<string> {
  return await loadSystemPrompt('fix');
}

async function loadSystemPrompt(kind: SystemPromptKind): Promise<string> {
  const cached = systemPromptCache.get(kind);
  if (cached) {
    return await cached;
  }

  const promptPath = path.join(findToolRoot(), 'prompts', SYSTEM_PROMPT_FILES[kind]);
  const loadTask = fs.readFile(promptPath, 'utf8')
    .then(prompt => prompt.trim())
    .catch(error => {
      systemPromptCache.delete(kind);
      throw error;
    });
  systemPromptCache.set(kind, loadTask);
  return await loadTask;
}
