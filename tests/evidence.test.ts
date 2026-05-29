import {describe, expect, it} from 'vitest';
import {buildPreviewLines, formatEvidenceLabel, parseEvidenceLocation, resolveEvidenceWindow} from '../src/lib/evidence.js';

describe('evidence helpers', () => {
  it('parses file and line evidence references', () => {
    expect(parseEvidenceLocation('src/example.ts:12')).toEqual({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 12
    });

    expect(parseEvidenceLocation('src/example.ts:12:4-14:2')).toEqual({
      filePath: 'src/example.ts',
      startLine: 12,
      endLine: 14
    });
  });

  it('formats evidence labels and nearby preview windows', () => {
    const location = parseEvidenceLocation('src/example.ts:7-8');

    expect(location).not.toBeNull();
    expect(formatEvidenceLabel(location!)).toBe('src/example.ts:7-8');
    expect(resolveEvidenceWindow(location!, 40)).toEqual({
      startLine: 7,
      endLine: 8
    });
    expect(buildPreviewLines(['a', 'b', 'c'], 1, 2)).toEqual([
      {number: 1, text: 'a'},
      {number: 2, text: 'b'}
    ]);
  });
});
