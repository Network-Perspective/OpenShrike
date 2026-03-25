import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {RepoMutationGuard} from '../src/lib/repo-guard.js';

const tempRoots: string[] = [];

describe('RepoMutationGuard', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, {recursive: true, force: true})));
  });

  it('ignores configured paths', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-guard-'));
    tempRoots.push(repoRoot);

    await fs.writeFile(path.join(repoRoot, 'tracked.txt'), 'stable\n', 'utf8');
    await fs.mkdir(path.join(repoRoot, '.openshrike-debug'), {recursive: true});
    await fs.writeFile(path.join(repoRoot, '.openshrike-debug', 'scan.jsonl'), 'line1\n', 'utf8');

    const guard = await RepoMutationGuard.capture(repoRoot, {
      ignoredPaths: ['.openshrike-debug/scan.jsonl']
    });

    await fs.appendFile(path.join(repoRoot, '.openshrike-debug', 'scan.jsonl'), 'line2\n', 'utf8');

    await expect(guard.throwIfMutated()).resolves.toBeUndefined();
  });

  it('still detects tracked file changes', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-guard-'));
    tempRoots.push(repoRoot);

    await fs.writeFile(path.join(repoRoot, 'tracked.txt'), 'stable\n', 'utf8');

    const guard = await RepoMutationGuard.capture(repoRoot);
    await fs.writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

    await expect(guard.throwIfMutated()).rejects.toThrow(/guardrail violation/i);
  });
});
