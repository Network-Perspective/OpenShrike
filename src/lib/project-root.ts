import path from 'node:path';
import fs from 'node:fs';

export function findToolRoot(): string {
  const candidates = [
    typeof __dirname === 'string' ? __dirname : null,
    process.env.OPENSHRIKE_TOOL_ROOT ?? null,
    process.cwd(),
    process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : null
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
