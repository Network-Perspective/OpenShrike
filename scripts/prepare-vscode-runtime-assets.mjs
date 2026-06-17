#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDirectory, 'package-lock.json');
const targetPath = path.join(rootDirectory, 'docker', 'openshrike-runtime.package-lock.json');

const sourceContent = await readFile(sourcePath, 'utf8');
let targetContent = null;

try {
  targetContent = await readFile(targetPath, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

if (targetContent === sourceContent) {
  process.exit(0);
}

await mkdir(path.dirname(targetPath), {recursive: true});
await writeFile(targetPath, sourceContent, 'utf8');
