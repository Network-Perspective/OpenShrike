import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';

export function findToolRoot(): string {
  const start = path.dirname(fileURLToPath(import.meta.url));
  let current = start;

  while (true) {
    if (fs.existsSync(path.join(current, 'best_practices'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not locate project root containing 'best_practices'.");
    }

    current = parent;
  }
}

export function resolveFromToolRoot(...segments: string[]): string {
  return path.join(findToolRoot(), ...segments);
}
