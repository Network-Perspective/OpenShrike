---
id: rel-typescript-001
title: Async boundary validation rejects invalid input before side effects
domain: rel
language: typescript
app-type: [any]
status: active
sources:
  - type: article
    title: Parse, Don't Validate
  - type: documentation
    title: Zod / Valibot documentation - runtime validation at boundaries
---

# rel-typescript-001: Async boundary validation rejects invalid input before side effects

## Intent
Prevent malformed external data from causing writes or side effects before validation completes.

## Applicability
Applies to TypeScript boundary handlers that parse external input and may run async schema logic.

## What to inspect
Schema parsing APIs, async refinements, and whether side effects begin before parsing completes.

## Pass criteria
Boundary input is fully parsed, using async parse APIs when needed, before side effects begin.

## Fail criteria
The diff starts side effects before finishing validation or uses synchronous parse APIs on async schema logic.

## Do not flag
Fully synchronous schemas with no side effects before parse completion.

## Confidence guidance
`HIGH` when the wrong parse API or ordering is directly visible. `MEDIUM` when async schema behavior is partly hidden. `LOW` when boundary ownership is unclear.

## Remediation
Complete runtime parsing first and use async parse APIs for schemas with async logic.

## Pass example
```ts
const input = await Schema.parseAsync(req.body)
```

## Fail example
```ts
const input = Schema.parse(req.body)
await save(input)
```
