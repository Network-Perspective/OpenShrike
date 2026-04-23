import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveFromToolRoot} from './project-root.js';

export async function resolveCheckDefinitionPath(checkId: string): Promise<string> {
  const checksDirectory = resolveFromToolRoot('best_practices', 'checks');
  const expectedFileName = `${checkId}.md`;
  const match = await findFileByName(checksDirectory, expectedFileName);

  if (!match) {
    throw new Error(
      `Unknown check id '${checkId}'. Expected markdown definition named '${expectedFileName}'.`
    );
  }

  return match;
}

export async function readCheckDefinition(checkId: string): Promise<string> {
  const resolvedPath = await resolveCheckDefinitionPath(checkId);
  return await fs.readFile(resolvedPath, 'utf8');
}

export async function readCheckTitle(checkId: string): Promise<string> {
  const definition = await readCheckDefinition(checkId);
  return extractCheckTitleFromDefinition(definition, checkId);
}

export function extractCheckTitleFromDefinition(
  definition: string,
  fallbackTitle = 'Unknown check'
): string {
  for (const rawLine of definition.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith('# ')) {
      continue;
    }

    const heading = line.slice(2).trim();
    const separatorIndex = heading.indexOf(':');
    if (separatorIndex >= 0) {
      const title = heading.slice(separatorIndex + 1).trim();
      return title || fallbackTitle;
    }

    return heading || fallbackTitle;
  }

  return fallbackTitle;
}

async function findFileByName(directory: string, expectedFileName: string): Promise<string | null> {
  const entries = await fs.readdir(directory, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileByName(fullPath, expectedFileName);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase() === expectedFileName.toLowerCase()) {
      return fullPath;
    }
  }

  return null;
}
