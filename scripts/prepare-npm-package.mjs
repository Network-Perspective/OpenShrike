#!/usr/bin/env node

import fs from 'node:fs';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEFAULT_OUT_DIR = '.artifacts/npm/package';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let outDir = DEFAULT_OUT_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--out-dir':
        outDir = argv[index + 1] ?? '';
        index += 1;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!outDir) {
    throw new Error('Expected a non-empty value for --out-dir.');
  }

  return path.resolve(ROOT_DIR, outDir);
}

function printUsage() {
  process.stdout.write(
    'Usage: node scripts/prepare-npm-package.mjs [--out-dir <path>]\n'
  );
}

function assertPathExists(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required path does not exist: ${relativePath}`);
  }
}

async function main() {
  const outDir = parseArgs(process.argv.slice(2));
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const rootPackage = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  assertPathExists('dist/cli.js');
  assertPathExists('best_practices');
  assertPathExists('prompts');
  assertPathExists('LICENSE');
  assertPathExists('README.npm.md');

  const npmPackage = {
    name: '@networkperspective/openshrike',
    version: rootPackage.version,
    description: rootPackage.description,
    type: rootPackage.type,
    license: rootPackage.license ?? 'MIT',
    homepage: rootPackage.homepage,
    repository: rootPackage.repository,
    bugs: rootPackage.bugs,
    keywords: rootPackage.keywords ?? [
      'openshrike',
      'cli',
      'code-review',
      'security',
      'llm'
    ],
    bin: {
      shrike: './dist/cli.js'
    },
    engines: {
      node: rootPackage.engines?.node
    },
    files: [
      'dist',
      'best_practices',
      'prompts',
      'README.md',
      'LICENSE'
    ],
    publishConfig: {
      access: 'public'
    },
    dependencies: rootPackage.dependencies
  };

  await rm(outDir, {recursive: true, force: true});
  await mkdir(path.join(outDir, 'dist'), {recursive: true});
  await cp(path.join(ROOT_DIR, 'dist', 'cli.js'), path.join(outDir, 'dist', 'cli.js'));
  await cp(path.join(ROOT_DIR, 'best_practices'), path.join(outDir, 'best_practices'), {recursive: true});
  await cp(path.join(ROOT_DIR, 'prompts'), path.join(outDir, 'prompts'), {recursive: true});
  await cp(path.join(ROOT_DIR, 'LICENSE'), path.join(outDir, 'LICENSE'));
  await cp(path.join(ROOT_DIR, 'README.npm.md'), path.join(outDir, 'README.md'));
  await writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(npmPackage, null, 2)}\n`);

  process.stdout.write(`Prepared npm package directory at ${outDir}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
