import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveFromToolRoot} from './project-root.js';
import type {PolicyDefinition} from './types.js';

const CHECK_LINK_REGEX = /\(\.\.\/checks\/[^)]+\/(?<checkFile>[^)/]+\.md)\)/gi;

export interface PolicyCatalogEntry {
  id: string;
  title: string;
  path: string;
  version: string;
}

export async function resolvePolicyDefinition(policyId: string): Promise<PolicyDefinition> {
  const policiesDirectory = resolveFromToolRoot('best_practices', 'policies');
  const expectedFileName = `${policyId}.md`;
  const policyPath = await findFileByName(policiesDirectory, expectedFileName);

  if (!policyPath) {
    throw new Error(
      `Unknown policy id '${policyId}'. Expected markdown definition named '${expectedFileName}'.`
    );
  }

  const text = await fs.readFile(policyPath, 'utf8');
  const checkIds = [...text.matchAll(CHECK_LINK_REGEX)]
    .map(match => path.basename(match.groups?.checkFile ?? '', '.md'))
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index);

  if (checkIds.length === 0) {
    throw new Error(`Policy '${policyId}' contains no linked check definitions.`);
  }

  const stats = await fs.stat(policyPath);
  return {
    id: policyId,
    version: stats.mtime.toISOString().slice(0, 10),
    checkIds
  };
}

export async function listPolicyCatalog(): Promise<PolicyCatalogEntry[]> {
  const policiesDirectory = resolveFromToolRoot('best_practices', 'policies');
  const markdownFiles = await listMarkdownFiles(policiesDirectory);
  const catalog = await Promise.all(
    markdownFiles.map(async policyPath => {
      const raw = await fs.readFile(policyPath, 'utf8');
      const stats = await fs.stat(policyPath);
      const id = path.basename(policyPath, '.md');

      return {
        id,
        title: extractPolicyTitle(raw, id),
        path: policyPath,
        version: stats.mtime.toISOString().slice(0, 10)
      };
    })
  );

  return catalog.sort((left, right) => left.id.localeCompare(right.id));
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

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractPolicyTitle(definition: string, fallbackTitle: string): string {
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
