---
id: bp-sec-001
title: External input is validated at trust boundaries
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Alice and Bob Learn Application Security
    author: Tanya Janca
  - type: book
    title: Designing Secure Software
    author: Loren Kohnfelder
    year: 2021
  - type: article
    title: code review research & blog
    author: Michaela Greiler
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: standard
    title: OWASP Proactive Controls
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
  - type: standard
    title: Rails Security Guide
  - type: book
    title: Secure by Design
    author: Dan Bergh Johnsson, Daniel Deogun, Daniel Sawano
  - type: article
    title: "Survive The Deep End: PHP Security"
---

# bp-sec-001: External input is validated at trust boundaries

## Intent
Reject invalid, malicious, or semantically impossible input at the trust boundary before it reaches business logic, persistence, or privileged operations.

## Applicability
Applies to HTTP endpoints, RPC handlers, webhooks, CLI entrypoints, message consumers, file-ingestion paths, and similar boundaries. Return `unknown` when the validation pipeline exists but is outside the visible scope.

## What to inspect
Changed boundary handlers, schema parsers, DTO binding, regex or enum validation, and whether validation runs before side effects begin.

## Pass criteria
Server-side validation is explicit and reviewable. Constrained fields use types, schemas, allowlists, ranges, or fixed enums before the data is used.

## Fail criteria
Raw external input flows into business logic, persistence, authorization, or command execution with no visible validation, or the code relies only on ad hoc denylist filtering as the primary barrier.

## Do not flag
Internal calls that are not trust boundaries. Boundary code that immediately delegates to a visible shared validator. Free-form text fields where sink-specific escaping is the real control.

## Confidence guidance
`HIGH` when the boundary and missing validation are directly visible. `MEDIUM` when validation may exist elsewhere but is not visible. `LOW` when the trust boundary is only partially shown.

## Remediation
Add explicit server-side validation at the boundary. Use schemas, typed parsers, allowlists, and fixed-set validation for constrained inputs.

## Pass example
```typescript
const CreateUser = z.object({ email: z.string().email(), age: z.number().int().min(18) });
const input = CreateUser.parse(req.body);
createUser(input);
```

## Fail example
```typescript
createUser(req.body);
```
