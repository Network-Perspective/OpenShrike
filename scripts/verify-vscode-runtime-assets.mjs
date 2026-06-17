#!/usr/bin/env node

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const [
    rootLockfile,
    dockerLockfile,
    dockerfile,
    prepareScript,
    vscodeIgnore,
    packageJsonRaw,
    scanSource
  ] = await Promise.all([
    readFile(path.join(rootDirectory, 'package-lock.json'), 'utf8'),
    readFile(path.join(rootDirectory, 'docker', 'openshrike-runtime.package-lock.json'), 'utf8'),
    readFile(path.join(rootDirectory, 'docker', 'openshrike-runtime.Dockerfile'), 'utf8'),
    readFile(path.join(rootDirectory, 'scripts', 'prepare-vscode-runtime-assets.mjs'), 'utf8'),
    readFile(path.join(rootDirectory, '.vscodeignore'), 'utf8'),
    readFile(path.join(rootDirectory, 'package.json'), 'utf8'),
    readFile(path.join(rootDirectory, 'src', 'lib', 'scan.ts'), 'utf8')
  ]);

  const failures = [];

  if (rootLockfile !== dockerLockfile) {
    failures.push(
      "docker/openshrike-runtime.package-lock.json is out of sync with package-lock.json. Run 'npm run prepare:vscode-runtime'."
    );
  }

  const dockerfileLines = new Set(dockerfile.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  if (!dockerfileLines.has('COPY docker/openshrike-runtime.package-lock.json ./package-lock.json')) {
    failures.push(
      "docker/openshrike-runtime.Dockerfile must copy docker/openshrike-runtime.package-lock.json into ./package-lock.json."
    );
  }
  if (dockerfileLines.has('COPY package-lock.json ./package-lock.json')) {
    failures.push(
      'docker/openshrike-runtime.Dockerfile must not copy the repo-root package-lock.json directly.'
    );
  }

  if (!/sourcePath\s*=\s*path\.join\(rootDirectory,\s*'package-lock\.json'\)/.test(prepareScript)) {
    failures.push("scripts/prepare-vscode-runtime-assets.mjs must source the repo-root package-lock.json.");
  }
  if (!/targetPath\s*=\s*path\.join\(rootDirectory,\s*'docker',\s*'openshrike-runtime\.package-lock\.json'\)/.test(prepareScript)) {
    failures.push("scripts/prepare-vscode-runtime-assets.mjs must write docker/openshrike-runtime.package-lock.json.");
  }

  const vscodeIgnoreLines = new Set(vscodeIgnore.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  for (const requiredLine of [
    'docker/**',
    '!docker/',
    '!docker/openshrike-runtime.Dockerfile',
    '!docker/openshrike-runtime.package-lock.json'
  ]) {
    if (!vscodeIgnoreLines.has(requiredLine)) {
      failures.push(`.vscodeignore must include '${requiredLine}'.`);
    }
  }

  const packageJson = JSON.parse(packageJsonRaw);
  const prepareScriptCommand = packageJson?.scripts?.['prepare:vscode-runtime'];
  if (prepareScriptCommand !== 'node scripts/prepare-vscode-runtime-assets.mjs') {
    failures.push("package.json must define prepare:vscode-runtime as 'node scripts/prepare-vscode-runtime-assets.mjs'.");
  }

  const prepublishScript = packageJson?.scripts?.['vscode:prepublish'];
  if (typeof prepublishScript !== 'string') {
    failures.push('package.json must define a vscode:prepublish script.');
  } else {
    if (!prepublishScript.includes('prepare:vscode-runtime')) {
      failures.push('package.json vscode:prepublish must run prepare:vscode-runtime.');
    }
    if (!prepublishScript.includes('verify:vscode-runtime')) {
      failures.push('package.json vscode:prepublish must run verify:vscode-runtime.');
    }
  }

  const includedPathsMatch = scanSource.match(/const includedPaths = \[(?<body>[\s\S]*?)\n\s*\];/);
  if (!includedPathsMatch?.groups?.body) {
    failures.push('Could not locate computeDockerRuntimeContextHash includedPaths in src/lib/scan.ts.');
  } else {
    const includedPathsBody = includedPathsMatch.groups.body;
    if (!includedPathsBody.includes("'docker/openshrike-runtime.package-lock.json'")) {
      failures.push('src/lib/scan.ts must include docker/openshrike-runtime.package-lock.json in the Docker runtime context hash.');
    }
    if (includedPathsBody.includes("'package-lock.json'")) {
      failures.push('src/lib/scan.ts must not include the repo-root package-lock.json in the Docker runtime context hash.');
    }
  }

  if (failures.length > 0) {
    console.error('VS Code runtime asset verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('VS Code runtime assets verified.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
