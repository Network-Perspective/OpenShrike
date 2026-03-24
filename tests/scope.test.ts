import {describe, expect, it} from 'vitest';
import {parseScanScopeKind} from '../src/lib/scope.js';

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
