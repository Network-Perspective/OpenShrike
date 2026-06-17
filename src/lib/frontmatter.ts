export type MarkdownFrontmatterScalar = boolean | number | string | null;
export type MarkdownFrontmatterValue = MarkdownFrontmatterScalar | MarkdownFrontmatterScalar[];

export interface ParsedMarkdownFrontmatter {
  attributes: Record<string, MarkdownFrontmatterValue>;
  body: string;
}

export function parseMarkdownFrontmatter(document: string): ParsedMarkdownFrontmatter {
  const lines = document.split(/\r?\n/u);
  if (lines[0]?.trim() !== '---') {
    return {
      attributes: {},
      body: document
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && isFrontmatterDelimiter(line));
  if (endIndex < 0) {
    return {
      attributes: {},
      body: document
    };
  }

  const attributes: Record<string, MarkdownFrontmatterValue> = {};

  for (let index = 1; index < endIndex;) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#') || hasIndentation(line)) {
      index += 1;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      index += 1;
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (rawValue.length > 0) {
      attributes[key] = parseSingleLineValue(rawValue);
      index += 1;
      continue;
    }

    index += 1;
    const blockLines: string[] = [];
    while (index < endIndex) {
      const candidate = lines[index] ?? '';
      if (candidate.trim().length === 0) {
        blockLines.push(candidate);
        index += 1;
        continue;
      }

      if (!hasIndentation(candidate)) {
        break;
      }

      blockLines.push(candidate);
      index += 1;
    }

    const blockValue = parseBlockValue(blockLines);
    if (blockValue !== undefined) {
      attributes[key] = blockValue;
    }
  }

  return {
    attributes,
    body: lines.slice(endIndex + 1).join('\n')
  };
}

export function readFrontmatterString(
  attributes: Record<string, MarkdownFrontmatterValue>,
  key: string
): string | undefined {
  const value = attributes[key];
  return typeof value === 'string' ? value : undefined;
}

export function readFrontmatterStringList(
  attributes: Record<string, MarkdownFrontmatterValue>,
  key: string
): string[] | undefined {
  const value = attributes[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every(item => typeof item === 'string') ? [...value] : undefined;
}

function isFrontmatterDelimiter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '---' || trimmed === '...';
}

function hasIndentation(line: string): boolean {
  return /^\s/u.test(line);
}

function parseSingleLineValue(value: string): MarkdownFrontmatterValue {
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseInlineArray(value);
  }

  return parseScalar(value);
}

function parseBlockValue(lines: readonly string[]): MarkdownFrontmatterScalar[] | undefined {
  const items: MarkdownFrontmatterScalar[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (!trimmed.startsWith('- ')) {
      return undefined;
    }

    items.push(parseScalar(trimmed.slice(2).trim()));
  }

  return items;
}

function parseInlineArray(value: string): MarkdownFrontmatterScalar[] {
  const inner = value.slice(1, -1).trim();
  if (inner.length === 0) {
    return [];
  }

  return splitInlineArrayItems(inner)
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(parseScalar);
}

function splitInlineArrayItems(value: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const character of value) {
    if (quote) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (character === ',') {
      items.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  items.push(current);
  return items;
}

function parseScalar(value: string): MarkdownFrontmatterScalar {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  if (/^-?\d+$/u.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
