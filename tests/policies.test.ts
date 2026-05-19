import {describe, expect, it} from 'vitest';
import {resolvePolicyDefinition} from '../src/lib/policies.js';

describe('resolvePolicyDefinition', () => {
  it('returns checks for csharp-baseline', async () => {
    const policy = await resolvePolicyDefinition('csharp-baseline');

    expect(policy.id).toBe('csharp-baseline');
    expect(policy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.checkIds).toContain('csharp-rel-001-cancellation-tokens');
  });

  it('returns checks for vertical-slice-architecture', async () => {
    const policy = await resolvePolicyDefinition('vertical-slice-architecture');

    expect(policy.id).toBe('vertical-slice-architecture');
    expect(policy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.checkIds).toContain('bp-arch-001-avoid-hidden-cross-module-dependencies');
    expect(policy.checkIds).toContain('vertical-slice-arch-001-feature-slices-own-use-cases');
    expect(policy.checkIds).toContain('vertical-slice-arch-004-shared-abstractions-are-demand-driven');
  });

  it('throws for unknown policy', async () => {
    await expect(resolvePolicyDefinition('not-a-real-policy')).rejects.toThrow(/unknown policy id/i);
  });
});
