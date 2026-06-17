---
id: test-002
title: Existing compatibility tests are preserved when public behavior changes
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Design and Build Great Web APIs
    author: Mike Amundsen
  - type: article
    title: Hyrum's Law
  - type: article
    title: Practical Test Pyramid
    author: Ham Vocke
---

# test-002: Existing compatibility tests are preserved when public behavior changes

## Intent
When public behavior changes, teams should add new compatibility evidence instead of weakening or deleting the old evidence that protects existing consumers.

## Applicability
Applies when a diff changes a published API, service contract, or other consumer-visible behavior and also changes existing compatibility or contract tests. Return `unknown` when the repository has no visible compatibility tests for that surface.

## What to inspect
Check deleted or weakened assertions, changed compatibility suites, CDC artifacts if the repo uses them, and whether prior behavior is still exercised alongside the new behavior.

## Pass criteria
Existing compatibility coverage for preserved behavior stays in place, and new behavior is covered with additional tests instead of by weakening the prior suite.

## Fail criteria
The diff removes, disables, or materially weakens existing compatibility evidence for still-supported behavior without an equivalent replacement.

## Do not flag
Pure test refactors that preserve meaning, movement of tests between files with equivalent assertions, or retirement of a clearly removed version whose shutdown path is separately covered.

## Confidence guidance
`HIGH` when assertions are deleted or loosened in the same PR as the public behavior change. `MEDIUM` when helper or generated test structure obscures equivalence. `LOW` when the source of truth lives elsewhere.

## Remediation
Keep the old compatibility assertions and add separate tests for the new or changed behavior.

## Pass example
```javascript
describe('v1 compatibility', () => {
  it('still accepts requests without postalCode', async () => {
    const res = await request(app).post('/users').send({ email: 'a@example.com' });
    expect(res.status).toBe(201);
  });
});
```

## Fail example
```javascript
// Old compatibility assertion deleted and replaced with only the new path.
it('creates user', async () => {
  const res = await request(app).post('/users').send({ email: 'a@example.com', postalCode: '12345' });
  expect(res.status).toBe(201);
});
```
