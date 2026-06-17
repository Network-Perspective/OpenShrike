import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  getBundledChecksDirectory,
  listCheckCatalog,
  readCheckTitle,
  resolveCheckDefinitionPath
} from '../src/lib/checks.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory =>
      fs.rm(directory, {recursive: true, force: true})
    )
  );
});

describe('check catalog', () => {
  it('resolves bundled checks by frontmatter id across checks and extended directories', async () => {
    const definitionPath = await resolveCheckDefinitionPath('typescript-arch-001');

    expect(definitionPath).toContain(path.join(
      'best_practices',
      'extended',
      'typescript',
      'typescript-arch-001-external-data-not-cast-directly-into-trusted-types.md'
    ));
    await expect(readCheckTitle('typescript-arch-001')).resolves.toBe(
      'External data is not cast directly into trusted types'
    );
  });

  it('lists bundled checks from the rebuilt best_practices library', async () => {
    const catalog = await listCheckCatalog(getBundledChecksDirectory());

    expect(catalog.map(entry => entry.id)).toContain('rel-typescript-001');
    expect(catalog.map(entry => entry.id)).toContain('typescript-arch-001');
    expect(catalog.map(entry => entry.id)).toContain('bp-sec-004');
    expect(catalog.find(entry => entry.id === 'rel-typescript-001')?.domain).toBe('rel');
    expect(catalog.find(entry => entry.id === 'typescript-arch-001')?.domain).toBe('arch');
  });

  it('falls back to filename and heading for project-local checks without frontmatter', async () => {
    const checksDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-project-checks-'));
    tempDirectories.push(checksDirectory);
    await fs.writeFile(
      path.join(checksDirectory, 'custom-check.md'),
      '# Custom Check Title\n\nBody\n',
      'utf8'
    );

    const catalog = await listCheckCatalog(checksDirectory);

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'custom-check',
        title: 'Custom Check Title',
        domain: null
      })
    ]);
  });

  it('infers domains from project-local ids or filenames when frontmatter domain is missing', async () => {
    const checksDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-project-checks-domain-'));
    tempDirectories.push(checksDirectory);
    await fs.writeFile(
      path.join(checksDirectory, 'rel-custom-001-network-timeouts.md'),
      '# REL-CUSTOM-001: Network timeouts are bounded\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(checksDirectory, 'custom-file.md'),
      [
        '---',
        'id: api-009',
        'title: API contracts remain compatible',
        '---',
        '',
        '# Placeholder title'
      ].join('\n'),
      'utf8'
    );

    const catalog = await listCheckCatalog(checksDirectory);
    expect(catalog.find(entry => entry.id === 'rel-custom-001-network-timeouts')?.domain).toBe('rel-custom');
    expect(catalog.find(entry => entry.id === 'api-009')?.domain).toBe('api');
  });

  it('uses project-local frontmatter ids when filenames do not match the check id', async () => {
    const checksDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-project-checks-frontmatter-'));
    tempDirectories.push(checksDirectory);
    const checkPath = path.join(checksDirectory, 'custom-file.md');
    await fs.writeFile(
      checkPath,
      [
        '---',
        'id: custom-check-001',
        'title: Custom check title',
        '---',
        '',
        '# Placeholder title'
      ].join('\n'),
      'utf8'
    );

    await expect(resolveCheckDefinitionPath('custom-check-001', {checksDirectory})).resolves.toBe(checkPath);
    await expect(readCheckTitle('custom-check-001', {checksDirectory})).resolves.toBe('Custom check title');
  });
});
