---
id: data-007
title: External data is validated at the boundary before downstream use
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Parse, Don't Validate
    author: Alexis King
---

# data-007: External data is validated at the boundary before downstream use

## Intent
Convert untrusted external data into a trusted internal shape before the rest of the system touches it.

## Applicability
Applies to request payloads, files, env vars, queue messages, and other untyped or external inputs. Return `unknown` when parsing is delegated immediately out of scope.

## What to inspect
Boundary parsers, schema decoders, validation wrappers, typed DTO creation, and downstream use of raw input.

## Pass criteria
External values are parsed into a constrained internal type or validated object before business or persistence logic runs.

## Fail criteria
Raw input crosses the boundary as loosely typed data and is checked piecemeal only after downstream use begins.

## Do not flag
Internal-only data flow between already validated domain objects.

## Confidence guidance
`HIGH` when raw external data is used directly. `MEDIUM` when parsing may happen in shared middleware. `LOW` when only the consumer side is visible.

## Remediation
Parse at the boundary, produce a trusted internal representation, and reject invalid data before downstream logic.

## Pass example
```typescript
const event = EventSchema.parse(req.body);
process(event);
```

## Fail example
```typescript
process(req.body as Event);
```
