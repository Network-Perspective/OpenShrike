import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {findToolRoot} from '../src/lib/project-root.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('findToolRoot', () => {
  it('resolves the installed package root from moduleUrl when cwd is unrelated', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-tool-root-'));
    tempDirectories.push(tempRoot);

    const packageRoot = path.join(tempRoot, 'package');
    const distDir = path.join(packageRoot, 'dist');
    const workingDir = path.join(tempRoot, 'repo');

    await fs.mkdir(path.join(packageRoot, 'best_practices'), {recursive: true});
    await fs.mkdir(distDir, {recursive: true});
    await fs.mkdir(workingDir, {recursive: true});

    const moduleUrl = pathToFileURL(path.join(distDir, 'cli.js')).href;

    expect(findToolRoot({
      moduleUrl,
      envToolRoot: null,
      cwd: workingDir,
      argv1: null
    })).toBe(packageRoot);
  });

  it('resolves argv[1] symlinks before searching for best_practices', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-tool-root-'));
    tempDirectories.push(tempRoot);

    const packageRoot = path.join(tempRoot, 'package');
    const distDir = path.join(packageRoot, 'dist');
    const binDir = path.join(tempRoot, 'bin');
    const workingDir = path.join(tempRoot, 'repo');
    const cliPath = path.join(distDir, 'cli.js');
    const symlinkPath = path.join(binDir, 'shrike');

    await fs.mkdir(path.join(packageRoot, 'best_practices'), {recursive: true});
    await fs.mkdir(distDir, {recursive: true});
    await fs.mkdir(binDir, {recursive: true});
    await fs.mkdir(workingDir, {recursive: true});
    await fs.writeFile(cliPath, '#!/usr/bin/env node\n', 'utf8');
    await fs.symlink(cliPath, symlinkPath);

    expect(findToolRoot({
      moduleUrl: null,
      envToolRoot: null,
      cwd: workingDir,
      argv1: symlinkPath
    })).toBe(packageRoot);
  });

  it('prefers OPENSHRIKE_TOOL_ROOT when explicitly provided', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-tool-root-'));
    tempDirectories.push(tempRoot);

    const envRoot = path.join(tempRoot, 'env-root');
    const packageRoot = path.join(tempRoot, 'package');
    const distDir = path.join(packageRoot, 'dist');
    const workingDir = path.join(tempRoot, 'repo');
    const moduleUrl = pathToFileURL(path.join(distDir, 'cli.js')).href;

    await fs.mkdir(path.join(envRoot, 'best_practices'), {recursive: true});
    await fs.mkdir(path.join(packageRoot, 'best_practices'), {recursive: true});
    await fs.mkdir(distDir, {recursive: true});
    await fs.mkdir(workingDir, {recursive: true});

    expect(findToolRoot({
      moduleUrl,
      envToolRoot: envRoot,
      cwd: workingDir,
      argv1: null
    })).toBe(envRoot);
  });
});
