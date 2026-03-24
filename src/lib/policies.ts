import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveFromToolRoot} from './project-root.js';
import type {PolicyDefinition} from './types.js';

const CHECK_LINK_REGEX = /\(\.\.\/checks\/[^)]+\/(?<checkFile>[^)/]+\.md)\)/gi;

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
