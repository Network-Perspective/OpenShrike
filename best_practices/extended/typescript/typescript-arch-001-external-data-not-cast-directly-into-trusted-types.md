---
id: typescript-arch-001
title: External data is not cast directly into trusted types
domain: arch
language: typescript
app-type: [any]
status: active
sources: []
---

# typescript-arch-001: External data is not cast directly into trusted types

## Intent
TypeScript types disappear at runtime, so external data must be validated before it is treated as trusted.

## Applicability
Applies when the diff accepts HTTP bodies, queue payloads, environment config, or JSON from external systems.

## What to inspect
`as SomeType`, angle-bracket casts, non-null assertions on external values, and visible runtime validation.

## Pass criteria
External data is validated at runtime before being treated as a trusted type.

## Fail criteria
The diff casts request, message, or config data directly into trusted types with no visible runtime validation.

## Do not flag
Values already validated earlier in the same visible flow and narrow test fixtures.

## Confidence guidance
`HIGH` when the unvalidated cast is direct. `MEDIUM` when validation may happen out of scope. `LOW` when data provenance is unclear.

## Remediation
Validate first, then convert the validated payload into the trusted type.

## Pass example
```ts
const parsed = OrderSchema.parse(req.body);
```

## Fail example
```ts
const parsed = req.body as Order;
```
