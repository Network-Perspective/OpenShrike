import fs from 'node:fs/promises';
import path from 'node:path';
import {CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME} from './constants.js';
import {resolveFromToolRoot} from './project-root.js';

export interface CheckCatalogEntry {
  id: string;
  path: string;
  version: string;
  mtimeMs: number;
}

export interface ResolveCheckDefinitionOptions {
  checksDirectory?: string | undefined;
}

export function getBundledChecksDirectory(): string {
  return resolveFromToolRoot('best_practices', 'checks');
}

export function getProjectChecksDirectory(repoRoot: string): string {
  return path.join(repoRoot, CONFIG_DIRECTORY_NAME, PROJECT_CHECKS_DIRECTORY_NAME);
}

export async function resolveCheckDefinitionPath(
  checkId: string,
  options: ResolveCheckDefinitionOptions = {}
): Promise<string> {
  const checksDirectory = options.checksDirectory ?? getBundledChecksDirectory();
  const expectedFileName = `${checkId}.md`;
  const match = await findFileByName(checksDirectory, expectedFileName);

  if (!match) {
    throw new Error(
      `Unknown check id '${checkId}'. Expected markdown definition named '${expectedFileName}' in '${checksDirectory}'.`
    );
  }

  return match;
}

export async function readCheckDefinition(
  checkId: string,
  options: ResolveCheckDefinitionOptions = {}
): Promise<string> {
  const resolvedPath = await resolveCheckDefinitionPath(checkId, options);
  return await fs.readFile(resolvedPath, 'utf8');
}

export async function readCheckTitle(
  checkId: string,
  options: ResolveCheckDefinitionOptions = {}
): Promise<string> {
  const definition = await readCheckDefinition(checkId, options);
  return extractCheckTitleFromDefinition(definition, checkId);
}

export async function listCheckCatalog(checksDirectory: string): Promise<CheckCatalogEntry[]> {
  const markdownFiles = await listMarkdownFiles(checksDirectory).catch(error => {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  });
  const entries = await Promise.all(
    markdownFiles.map(async checkPath => {
      const stats = await fs.stat(checkPath);
      return {
        id: path.basename(checkPath, '.md'),
        path: checkPath,
        version: stats.mtime.toISOString().slice(0, 10),
        mtimeMs: stats.mtimeMs
      } satisfies CheckCatalogEntry;
    })
  );

  const seenIds = new Map<string, CheckCatalogEntry>();
  for (const entry of entries) {
    const key = entry.id.toLowerCase();
    const existing = seenIds.get(key);
    if (existing) {
      throw new Error(
        `Duplicate check id '${entry.id}' found in '${existing.path}' and '${entry.path}'.`
      );
    }

    seenIds.set(key, entry);
  }

  return [...seenIds.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function resolveProjectCheckSelection(
  projectChecksDir: string,
  checkId?: string | undefined
): Promise<{
  checkIds: string[];
  version: string;
}> {
  const catalog = await listCheckCatalog(projectChecksDir);
  if (catalog.length === 0) {
    throw new Error(
      `No markdown checks found in '${projectChecksDir}'. Add at least one .md file or rerun 'shrike init'.`
    );
  }

  if (checkId) {
    const match = catalog.find(entry => entry.id.toLowerCase() === checkId.toLowerCase());
    if (!match) {
      throw new Error(
        `Unknown check id '${checkId}'. Expected markdown definition named '${checkId}.md' in '${projectChecksDir}'.`
      );
    }

    return {
      checkIds: [match.id],
      version: match.version
    };
  }

  return {
    checkIds: catalog.map(entry => entry.id),
    version: resolveLatestCatalogVersion(catalog)
  };
}

export function extractCheckTitleFromDefinition(
  definition: string,
  fallbackTitle = 'Unknown check'
): string {
  for (const rawLine of definition.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith('# ')) {
      continue;
    }

    const heading = line.slice(2).trim();
    const separatorIndex = heading.indexOf(':');
    if (separatorIndex >= 0) {
      const title = heading.slice(separatorIndex + 1).trim();
      return title || fallbackTitle;
    }

    return heading || fallbackTitle;
  }

  return fallbackTitle;
}

async function findFileByName(directory: string, expectedFileName: string): Promise<string | null> {
  const entries = await fs.readdir(directory, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileByName(fullPath, expectedFileName);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase() === expectedFileName.toLowerCase()) {
      return fullPath;
    }
  }

  return null;
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function resolveLatestCatalogVersion(catalog: readonly CheckCatalogEntry[]): string {
  const latestEntry = catalog.reduce((latest, entry) =>
    entry.mtimeMs > latest.mtimeMs ? entry : latest
  );
  return latestEntry.version;
}
