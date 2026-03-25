import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {createScanLogger} from '../src/lib/scan-log.js';

const tempRoots: string[] = [];

describe('createScanLogger', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, {recursive: true, force: true})));
  });

  it('writes jsonl entries to the requested file', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-log-'));
    tempRoots.push(tempRoot);

    const logPath = path.join(tempRoot, 'runtime', 'scan.jsonl');
    const logger = await createScanLogger(logPath);
    expect(logger).not.toBeNull();

    logger!.write('example', {
      nested: {
        ok: true
      }
    });
    await logger!.close();

    const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);

    expect(lines[0]).toBeDefined();
    expect(lines[1]).toBeDefined();

    const opened = JSON.parse(lines[0]!) as {kind: string};
    const entry = JSON.parse(lines[1]!) as {kind: string; data: {nested: {ok: boolean}}};

    expect(opened.kind).toBe('log.opened');
    expect(entry.kind).toBe('example');
    expect(entry.data.nested.ok).toBe(true);
  });
});
