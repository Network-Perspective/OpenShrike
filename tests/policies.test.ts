import {describe, expect, it} from 'vitest';
import {listPolicyCatalog, resolvePolicyDefinition} from '../src/lib/policies.js';

describe('resolvePolicyDefinition', () => {
  it('returns checks for lang-csharp', async () => {
    const policy = await resolvePolicyDefinition('lang-csharp');

    expect(policy.id).toBe('lang-csharp');
    expect(policy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.checkIds).toContain('csharp-rel-001');
    expect(policy.checkIds).toContain('bp-sec-001');
  });

  it('returns checks for shared-foundation', async () => {
    const policy = await resolvePolicyDefinition('shared-foundation');

    expect(policy.id).toBe('shared-foundation');
    expect(policy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.checkIds).toContain('bp-arch-001');
    expect(policy.checkIds).toContain('bp-api-001');
    expect(policy.checkIds).toContain('bp-sec-004');
  });

  it('lists selectable policies and excludes the manifest', async () => {
    const catalog = await listPolicyCatalog();

    expect(catalog.map(policy => policy.id)).toContain('lang-typescript');
    expect(catalog.map(policy => policy.id)).toContain('shared-foundation');
    expect(catalog.map(policy => policy.id)).not.toContain('policy-manifest');
  });

  it('throws for unknown policy', async () => {
    await expect(resolvePolicyDefinition('not-a-real-policy')).rejects.toThrow(/unknown policy id/i);
  });
});
