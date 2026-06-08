import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export interface FindToolRootOptions {
  moduleUrl?: string | null;
  envToolRoot?: string | null;
  cwd?: string | null;
  argv1?: string | null;
}

export function findToolRoot(options: FindToolRootOptions = {}): string {
  const candidates = [
    options.envToolRoot === undefined ? process.env.OPENSHRIKE_TOOL_ROOT ?? null : options.envToolRoot,
    getModuleDirectory(options.moduleUrl === undefined ? import.meta.url : options.moduleUrl),
    options.cwd === undefined ? process.cwd() : options.cwd,
    getScriptDirectory(options.argv1 === undefined ? process.argv[1] ?? null : options.argv1)
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const resolved = findToolRootFrom(candidate);
    if (resolved) {
      return resolved;
    }
  }

  throw new Error("Could not locate project root containing 'best_practices'.");
}

export function resolveFromToolRoot(...segments: string[]): string {
  return path.join(findToolRoot(), ...segments);
}

function getModuleDirectory(moduleUrl: string | null): string | null {
  if (!moduleUrl) {
    return null;
  }

  try {
    return path.dirname(fileURLToPath(moduleUrl));
  } catch {
    return null;
  }
}

function getScriptDirectory(scriptPath: string | null): string | null {
  if (!scriptPath) {
    return null;
  }

  const resolvedScriptPath = path.resolve(scriptPath);

  try {
    return path.dirname(fs.realpathSync(resolvedScriptPath));
  } catch {
    return path.dirname(resolvedScriptPath);
  }
}

function findToolRootFrom(start: string): string | null {
  let current = path.resolve(start);

  while (true) {
    if (fs.existsSync(path.join(current, 'best_practices'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}
