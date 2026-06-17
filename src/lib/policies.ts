import fs from 'node:fs/promises';
import path from 'node:path';
import {parseMarkdownFrontmatter, readFrontmatterString, readFrontmatterStringList} from './frontmatter.js';
import {resolveFromToolRoot} from './project-root.js';
import type {PolicyDefinition} from './types.js';

const CHECK_LINK_REGEX = /\[(?<checkId>[^\]]+)\]\((?<target>\.\.\/(?:checks|extended)\/[^)]+\.md)\)/giu;

export interface PolicyCatalogEntry {
  id: string;
  title: string;
  path: string;
  version: string;
}

export async function resolvePolicyDefinition(policyId: string): Promise<PolicyDefinition> {
  const resolved = await resolveBundledPolicyEntry(policyId);
  return {
    id: resolved.id,
    version: resolved.version,
    checkIds: resolved.checkIds
  };
}

export async function listPolicyCatalog(): Promise<PolicyCatalogEntry[]> {
  const catalog = await loadBundledPolicyCatalog();
  return catalog
    .map(({id, title, path: policyPath, version}) => ({
      id,
      title,
      path: policyPath,
      version
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
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

async function resolveBundledPolicyEntry(
  policyId: string,
  seenPolicyIds: Set<string> = new Set()
): Promise<ResolvedPolicyEntry> {
  const catalog = await loadBundledPolicyCatalog();
  const match = catalog.find(entry => entry.id.toLowerCase() === policyId.toLowerCase());

  if (!match) {
    throw new Error(
      `Unknown policy id '${policyId}'. Expected a markdown policy with that id under '${resolvePoliciesDirectory()}'.`
    );
  }

  const normalizedPolicyId = match.id.toLowerCase();
  if (seenPolicyIds.has(normalizedPolicyId)) {
    throw new Error(`Policy '${match.id}' includes itself recursively.`);
  }

  const directCheckIds = match.checkIds;
  if (directCheckIds.length > 0) {
    return match;
  }

  if (match.includes.length === 0) {
    throw new Error(`Policy '${match.id}' contains no check definitions.`);
  }

  const nextSeenPolicyIds = new Set(seenPolicyIds);
  nextSeenPolicyIds.add(normalizedPolicyId);
  const includedPolicies = await Promise.all(
    match.includes.map(includeId => resolveBundledPolicyEntry(includeId, nextSeenPolicyIds))
  );

  return {
    ...match,
    checkIds: uniqueCaseInsensitive(includedPolicies.flatMap(policy => policy.checkIds))
  };
}

async function loadBundledPolicyCatalog(): Promise<ResolvedPolicyEntry[]> {
  const policiesDirectory = resolvePoliciesDirectory();
  const markdownFiles = await listMarkdownFiles(policiesDirectory);
  const entries = await Promise.all(markdownFiles.map(readPolicyEntry));
  const catalog = entries.filter((entry): entry is ResolvedPolicyEntry => entry !== null);
  const seenIds = new Map<string, string>();

  for (const entry of catalog) {
    const existingPath = seenIds.get(entry.id.toLowerCase());
    if (existingPath) {
      throw new Error(`Duplicate policy id '${entry.id}' found in '${existingPath}' and '${entry.path}'.`);
    }

    seenIds.set(entry.id.toLowerCase(), entry.path);
  }

  return catalog;
}

async function readPolicyEntry(policyPath: string): Promise<ResolvedPolicyEntry | null> {
  const raw = await fs.readFile(policyPath, 'utf8');
  const stats = await fs.stat(policyPath);
  const {attributes, body} = parseMarkdownFrontmatter(raw);
  const id = readFrontmatterString(attributes, 'id') ?? path.basename(policyPath, '.md');
  const title = readFrontmatterString(attributes, 'title') ?? extractPolicyTitle(raw, id);
  const kind = readFrontmatterString(attributes, 'kind');

  if (kind === 'manifest') {
    return null;
  }

  return {
    id,
    title,
    path: policyPath,
    version: stats.mtime.toISOString().slice(0, 10),
    checkIds: uniqueCaseInsensitive(
      readFrontmatterStringList(attributes, 'checks') ?? extractCheckIdsFromPolicyBody(body)
    ),
    includes: readFrontmatterStringList(attributes, 'includes') ?? []
  };
}

function resolvePoliciesDirectory(): string {
  return resolveFromToolRoot('best_practices', 'policies');
}

function extractCheckIdsFromPolicyBody(definition: string): string[] {
  return uniqueCaseInsensitive(
    [...definition.matchAll(CHECK_LINK_REGEX)]
      .map(match => match.groups?.checkId?.trim() ?? '')
      .filter(Boolean)
  );
}

function uniqueCaseInsensitive(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.filter(value => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function extractPolicyTitle(definition: string, fallbackTitle: string): string {
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

interface ResolvedPolicyEntry extends PolicyCatalogEntry {
  checkIds: string[];
  includes: string[];
}
