---
id: rel-typescript-002
title: Async APIs keep a consistent timing model
domain: rel
language: typescript
app-type: [any]
status: active
sources:
  - type: book
    title: Effective TypeScript
    item: "Item 25"
---

# rel-typescript-002: Async APIs keep a consistent timing model

## Intent
Prevent callers from racing because one branch of an API resolves synchronously while another resolves asynchronously.

## Applicability
Applies to promise-based TypeScript APIs with cached and uncached or fast and slow branches.

## What to inspect
Promise-returning functions, cache-hit branches, and whether all branches resolve on the same async timing model.

## Pass criteria
All branches of the async API behave consistently from the caller's perspective.

## Fail criteria
The diff makes one branch synchronous and another asynchronous in a way that changes ordering semantics.

## Do not flag
Purely synchronous APIs that do not claim async behavior.

## Confidence guidance
`HIGH` when mixed timing branches are directly visible. `MEDIUM` when helper behavior is inferred. `LOW` when only one branch is in scope.

## Remediation
Normalize completion timing so all branches use the same async contract.

## Pass example
```ts
return Promise.resolve(cachedValue)
```

## Fail example
```ts
if (cached) return cachedValue
return fetchValue()
```
