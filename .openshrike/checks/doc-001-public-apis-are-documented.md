---
id: doc-001
title: Externally consumed public APIs are documented
domain: doc
language: shared
app-type: [library]
status: active
sources:
  - type: book
    title: Effective TypeScript
    author: Dan Vanderkam
  - type: standard
    title: Kotlin Coding Conventions
  - type: standard
    title: Rust API Guidelines
  - type: book
    title: The Rust Programming Language
  - type: standard
    title: Swift API Design Guidelines
---

# doc-001: Externally consumed public APIs are documented

## Intent
If a repository publishes a reusable library, SDK, framework, or other public
API surface, that surface should explain behavior consumers cannot safely infer
from signatures alone.

## Applicability
Applies only to externally consumed libraries, SDKs, packages, frameworks, and
similar reusable artifacts.

Return `unknown` for internal applications and services.

## What to inspect
1. Determine whether the project exposes a public API to external consumers.
2. Review changed public members for missing or stale consumer-facing
   documentation.
3. Check whether failure modes, side effects, constraints, and usage semantics
   that matter to callers are documented where the ecosystem expects them.

## Pass criteria
- New or changed public APIs include meaningful consumer-facing documentation.
- The documentation explains behavior, important parameters or return
  semantics, and failure or safety conditions when those matter to consumers.

## Fail criteria
- A reusable package adds or materially changes consumer-facing public API with
  no meaningful documentation.
- Public API docs exist but omit important caller-relevant behavior such as
  failure modes, panic conditions, side effects, or safety requirements.

## Do not flag
- Internal services.
- Obvious overrides or interface implementations whose docs are inherited.
- Trivial DTO fields whose meaning is fully apparent from the declaration.
- Generated bindings or framework wiring symbols not meant for direct human use.

## Confidence guidance
- `HIGH`: reusable library context and undocumented public API are directly
  visible.
- `MEDIUM`: public-consumer scope is inferred from packaging or exports.
- `LOW`: prefer `unknown` if consumer expectations are unclear.

## Remediation
- Add consumer-facing API documentation that describes what the declaration
  does, how to use it, and the important constraints callers must handle.

## Pass example
```typescript
/**
 * Sends the command once and returns the accepted job id.
 * Throws when the server rejects the command.
 */
export async function send(command: Command): Promise<string> {
  return transport.send(command);
}
```

## Fail example
```typescript
export async function send(command: Command): Promise<string> {
  return transport.send(command);
}
```
