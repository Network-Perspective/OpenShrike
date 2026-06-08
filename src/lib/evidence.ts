import fs from 'node:fs/promises';
import path from 'node:path';

export interface EvidenceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface EvidencePreviewLine {
  number: number;
  text: string;
}

export interface EvidencePreview {
  raw: string;
  location: EvidenceLocation | null;
  displayLabel: string;
  lines: EvidencePreviewLine[] | null;
}

export function parseEvidenceLocation(value: string): EvidenceLocation | null {
  const match = /^(?<file>.+?):(?<start>\d+)(?::\d+)?(?:-(?<end>\d+)(?::\d+)?)?$/u.exec(value.trim());
  if (!match?.groups?.file || !match.groups.start) {
    return null;
  }

  const startLine = Number.parseInt(match.groups.start, 10);
  const endLine = Number.parseInt(match.groups.end ?? match.groups.start, 10);
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
    return null;
  }

  return {
    filePath: match.groups.file,
    startLine: Math.max(1, Math.min(startLine, endLine)),
    endLine: Math.max(1, Math.max(startLine, endLine))
  };
}

export function resolveEvidenceWindow(
  location: EvidenceLocation,
  totalLines: number
): {startLine: number; endLine: number} | null {
  const span = location.endLine - location.startLine + 1;
  if (span > 3) {
    return null;
  }

  if (span === 1) {
    return {
      startLine: Math.max(1, location.startLine - 1),
      endLine: Math.min(totalLines, location.endLine + 1)
    };
  }

  return {
    startLine: Math.max(1, location.startLine),
    endLine: Math.min(totalLines, location.endLine)
  };
}

export function buildPreviewLines(
  sourceLines: string[],
  startLine: number,
  endLine: number
): EvidencePreviewLine[] {
  const lines: EvidencePreviewLine[] = [];

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    lines.push({
      number: lineNumber,
      text: sourceLines[lineNumber - 1] ?? ''
    });
  }

  return lines;
}

export function formatEvidenceLabel(location: EvidenceLocation): string {
  return location.startLine === location.endLine
    ? `${location.filePath}:${location.startLine}`
    : `${location.filePath}:${location.startLine}-${location.endLine}`;
}

export function buildEvidenceFallbackPreview(evidence: string): EvidencePreview {
  const location = parseEvidenceLocation(evidence);

  return {
    raw: evidence,
    location,
    displayLabel: location ? formatEvidenceLabel(location) : evidence,
    lines: null
  };
}

export function buildEvidenceFallbackPreviews(evidence: readonly string[]): EvidencePreview[] {
  return evidence.map(buildEvidenceFallbackPreview);
}

export async function loadEvidencePreview(
  evidence: string,
  repoPath: string
): Promise<EvidencePreview> {
  const fallback = buildEvidenceFallbackPreview(evidence);
  if (!fallback.location) {
    return fallback;
  }

  try {
    const fileContents = await fs.readFile(path.resolve(repoPath, fallback.location.filePath), 'utf8');
    const sourceLines = fileContents.split(/\r?\n/u);
    const window = resolveEvidenceWindow(fallback.location, sourceLines.length);

    return {
      ...fallback,
      lines: window
        ? buildPreviewLines(sourceLines, window.startLine, window.endLine)
        : null
    };
  } catch {
    return fallback;
  }
}

export async function loadEvidencePreviews(
  evidence: readonly string[],
  repoPath: string
): Promise<EvidencePreview[]> {
  return Promise.all(evidence.map(item => loadEvidencePreview(item, repoPath)));
}
