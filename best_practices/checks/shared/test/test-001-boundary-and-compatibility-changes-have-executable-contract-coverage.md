---
id: test-001
title: Boundary and compatibility changes have executable contract coverage
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Design and Build Great Web APIs
    author: Mike Amundsen
  - type: article
    title: Google Testing Blog
  - type: book
    title: Growing Object-Oriented Software, Guided by Tests
    author: Steve Freeman & Nat Pryce
  - type: article
    title: Practical Test Pyramid
    author: Ham Vocke
---

# test-001: Boundary and compatibility changes have executable contract coverage

## Intent
Changes to request or response boundaries, serialized contracts, and protocol messages need executable evidence that the real wire or payload shape still matches the intended contract.

## Applicability
Applies when the diff changes a public API operation, serialized payload, database serialization boundary, queue message, or protocol message, and the repository contains executable tests for that boundary. Return `unknown` when the test harness for that boundary is outside visible scope.

## What to inspect
Look at changed routes, payload serializers, protocol adapters, integration or contract tests, and whether assertions cover status, content type, structure, fields, and negative-path behavior through the real boundary.

## Pass criteria
The changed boundary has executable tests that cover the contract shape and at least one meaningful behavior or rejection case. Assertions are strong enough to detect contract drift, not just reachability.

## Fail criteria
The diff changes a boundary contract but adds no corresponding contract coverage, or adds only smoke assertions that would miss the changed shape, fields, or rejection behavior.

## Do not flag
Internal-only seams, metadata-only spec edits, or repositories that clearly keep contract tests in another location not visible here.

## Confidence guidance
`HIGH` when the changed boundary is visible and nearby tests clearly omit contract assertions. `MEDIUM` when helper layers hide part of the real assertion strength. `LOW` when the boundary test location is unclear.

## Remediation
Add or update executable contract tests that exercise the real boundary and assert the relevant structure and behavior.

## Pass example
```javascript
it('rejects duplicate company names', async () => {
  const res = await request(app).post('/companies').send({ companyName: 'Acme' });
  expect(res.status).toBe(400);
  expect(res.body.detail).toContain('duplicate');
});
```

## Fail example
```javascript
it('companies endpoint exists', async () => {
  const res = await request(app).post('/companies').send({});
  expect(res.status).toBeGreaterThan(0);
});
```
