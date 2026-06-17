---
id: data-typescript-007
title: TypeScript boundaries parse unknown data before use
domain: data
language: typescript
app-type: [any]
status: active
sources:
  - type: book
    title: Effective TypeScript
---

# data-typescript-007: TypeScript boundaries parse unknown data before use

## Intent
Keep untyped boundary values from spreading `any`-driven assumptions through TypeScript code.

## Applicability
Applies to `JSON.parse`, third-party SDKs, browser storage, and network payloads. Return `unknown` when a visible decoder wrapper owns the boundary.

## What to inspect
`any`, `unknown`, casts after parsing, schema libraries, and property access on parsed payloads.

## Pass criteria
Boundary helpers return `unknown` or a parsed typed value, and unchecked casts are replaced by explicit parsing or narrowing.

## Fail criteria
`JSON.parse` or similar sources return `any` that is used directly, or code asserts a target type without parsing or narrowing.

## Do not flag
Already parsed library types with documented runtime validation.

## Confidence guidance
`HIGH` when unchecked `any` flows into property access. `MEDIUM` when a wrapper may validate internally. `LOW` when only type declarations changed.

## Remediation
Return `unknown` from untyped boundaries and parse or narrow before use.

## Pass example
```typescript
const raw: unknown = JSON.parse(body);
const user = UserSchema.parse(raw);
```

## Fail example
```typescript
const user = JSON.parse(body) as User;
saveUser(user.email);
```
