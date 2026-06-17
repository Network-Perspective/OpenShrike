---
id: sec-typescript-001
title: Parse external TypeScript boundary data before trusting its type
domain: sec
language: typescript
app-type: [any]
status: active
sources:
  - type: article
    title: Parse, Don't Validate
  - type: standard
    title: "Zod/Valibot documentation: runtime validation at boundaries"
---

# sec-typescript-001: Parse external TypeScript boundary data before trusting its type

## Intent
Prevent unchecked casts from smuggling malformed external data past the type system.

## Applicability
Applies when TypeScript code consumes `req.body`, `request.json()`, `JSON.parse`, queue payloads, file contents, `process.env`, or external API responses. Return `unknown` when parsing happens in a helper outside scope.

## What to inspect
Boundary adapters, `as SomeType`, broad casts, non-null assertions on raw input, and runtime schema parsers.

## Pass criteria
Boundary data is runtime-parsed or validated before being treated as a trusted application type.

## Fail criteria
Raw external data is cast directly to a trusted type or passed downstream as though compile-time typing proved the runtime shape.

## Do not flag
Values already validated earlier in the same visible path. Generated decoders with visible runtime validation. Internal literals and test fixtures.

## Confidence guidance
`HIGH` when a raw boundary cast is directly visible. `MEDIUM` when a helper likely hides validation. `LOW` when the boundary is not clear.

## Remediation
Parse the boundary value with a runtime schema and pass the parsed result downstream.

## Pass example
```typescript
const env = EnvSchema.parse(process.env);
```

## Fail example
```typescript
const env = process.env as AppEnv;
```
