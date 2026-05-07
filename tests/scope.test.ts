import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {MAX_SCOPE_EVIDENCE_OUTPUT_LINES} from '../src/lib/constants.js';
import {parseScanScopeKind, resolveScanScope} from '../src/lib/scope.js';

const tempRoots: string[] = [];

describe('parseScanScopeKind', () => {
  it.each([
    ['uncommitted', 'uncommitted'],
    ['commit', 'commit'],
    ['branch', 'branch'],
    ['pr', 'pr'],
    ['full', 'full']
  ])('parses %s', (input, expected) => {
    expect(parseScanScopeKind(input)).toBe(expected);
  });

  it('returns null for unknown values', () => {
    expect(parseScanScopeKind('random')).toBeNull();
  });
});

describe('resolveScanScope', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, {recursive: true, force: true})));
  });

  it('captures untracked file patches alongside tracked changes for uncommitted scope', async () => {
    const repoRoot = await makeRepoRoot();

    await fs.mkdir(path.join(repoRoot, 'src'), {recursive: true});
    await fs.writeFile(path.join(repoRoot, 'src', 'tracked.ts'), 'export const tracked = 1;\n', 'utf8');
    git(repoRoot, ['add', '.']);
    git(repoRoot, ['commit', '-m', 'initial']);

    await fs.writeFile(path.join(repoRoot, 'src', 'tracked.ts'), 'export const tracked = 2;\n', 'utf8');
    await fs.writeFile(path.join(repoRoot, 'src', 'new-file.ts'), 'export const created = true;\n', 'utf8');

    const scope = await resolveScanScope(repoRoot, 'uncommitted');

    expect(scope.files).toEqual(['src/tracked.ts', 'src/new-file.ts']);
    expect(scope.scopeEvidence?.mode).toBe('complete');
    expect(scope.scopeEvidence?.commands.map(command => command.description)).toContain(
      'Tracked changes relative to HEAD'
    );
    expect(scope.scopeEvidence?.commands.some(command => command.description === 'Untracked file patch: src/new-file.ts')).toBe(true);

    const renderedEvidence = scope.scopeEvidence?.commands.map(command => command.output).join('\n') || '';
    expect(renderedEvidence).toContain('src/tracked.ts');
    expect(renderedEvidence).toContain('src/new-file.ts');
  });

  it('omits oversized captured diffs instead of attaching a partial patch', async () => {
    const repoRoot = await makeRepoRoot();

    await fs.mkdir(path.join(repoRoot, 'src'), {recursive: true});
    await fs.writeFile(path.join(repoRoot, 'src', 'large.txt'), 'baseline\n', 'utf8');
    git(repoRoot, ['add', '.']);
    git(repoRoot, ['commit', '-m', 'initial']);

    const largeContent = Array.from(
      {length: MAX_SCOPE_EVIDENCE_OUTPUT_LINES + 200},
      (_, index) => `line ${index} ${'x'.repeat(20)}`
    ).join('\n');
    await fs.writeFile(path.join(repoRoot, 'src', 'large.txt'), `${largeContent}\n`, 'utf8');

    const scope = await resolveScanScope(repoRoot, 'uncommitted');

    expect(scope.scopeEvidence?.mode).toBe('omitted');
    expect(scope.scopeEvidence?.commands.every(command => command.output === '')).toBe(true);
  });
});

async function makeRepoRoot(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-scope-'));
  tempRoots.push(repoRoot);
  git(repoRoot, ['-c', 'init.defaultBranch=main', 'init']);
  git(repoRoot, ['config', 'user.name', 'OpenShrike']);
  git(repoRoot, ['config', 'user.email', 'openshrike@example.com']);
  return repoRoot;
}

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8'
  });
}
