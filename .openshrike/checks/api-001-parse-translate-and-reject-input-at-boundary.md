---
id: api-001
title: External API input is parsed, translated, and rejected at the boundary before side effects
domain: api
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Modern Software Engineering
  - type: book
    title: Secure by Design
    author: Dan Bergh Johnsson; Daniel Deogun; Daniel Sawano
  - type: book
    title: Implementing Domain-Driven Design
    author: Vaughn Vernon
  - type: standard
    title: Microsoft REST API Guidelines; Zalando RESTful API Guidelines
  - type: standard
    title: OWASP Top 10 (2021, and the 2025 update cycle); OWASP API Security Top 10 (2023)
---

# api-001: External API input is parsed, translated, and rejected at the boundary before side effects

## Intent
Prevent malformed, unsupported, or over-posted request data from leaking into business logic, persistence, or authorization decisions.

## Applicability
Applies to HTTP, RPC, webhook, queue, and serverless entrypoints that accept external input. Return `unknown` when a visible boundary delegates immediately to a shared validator or anti-corruption layer outside scope.

## What to inspect
Changed request models, binders, validation schemas, endpoint filters, DTO-to-domain mapping, unknown-field handling, and writable-property allowlists.

## Pass criteria
External input is parsed or validated into an internal shape before side effects begin, unsupported fields are rejected on closed contracts, and only explicitly allowed fields reach domain logic.

## Fail criteria
Raw request data is trusted directly, validation happens after state changes begin, unknown fields are silently ignored on a typed contract, or binders can write properties the handler did not intend to expose.

## Do not flag
Framework-enforced primitives, explicit extension bags like `metadata`, or visible shared validation layers that own the boundary contract.

## Confidence guidance
`HIGH` when unparsed input flows directly into persistence or business logic. `MEDIUM` when helpers may own validation out of scope. `LOW` when only part of the boundary is visible.

## Remediation
Validate and translate the boundary payload first, reject unsupported input, and pass only the parsed internal shape downstream.

## Pass example
```typescript
const parsed = CreateOrderSchema.parse(req.body);
const cmd = toCreateOrder(parsed);
await service.create(cmd);
```

## Fail example
```typescript
await service.create(req.body);
```
