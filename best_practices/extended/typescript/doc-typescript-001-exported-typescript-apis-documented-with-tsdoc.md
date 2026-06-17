---
id: doc-typescript-001
title: Exported TypeScript APIs are documented with TSDoc
domain: doc
language: typescript
app-type: [library]
status: active
sources:
  - type: book
    title: Effective TypeScript
    author: Dan Vanderkam
---

# doc-typescript-001: Exported TypeScript APIs are documented with TSDoc

## Intent
Prevent public TypeScript APIs from being opaque at call sites. TSDoc is
surfaced directly in editors, so missing doc comments on exported APIs reduce
usability for consumers even when types are present.

## Applicability
Applies to reusable TypeScript libraries, SDKs, and packages that export
functions, classes, or types for external use. Return `unknown` for internal
services, application-only modules, generated exports, or private package
internals.

## What to inspect
New or changed exported functions, classes, interfaces, and type aliases, plus
adjacent JSDoc or TSDoc comments.

## Pass criteria
- Each changed exported API declaration has an adjacent JSDoc or TSDoc comment
  that explains behavior or meaning without merely restating the type syntax.

## Fail criteria
- An exported API is added or materially changed without any adjacent TSDoc or
  JSDoc comment.

## Do not flag
- Internal code.
- Re-export-only barrel files.
- Generated clients.
- Symbols exported only for framework wiring rather than for human
  consumption.

## Confidence guidance
- `HIGH`: the file clearly exposes a public symbol and lacks a doc comment.
- `MEDIUM`: export visibility depends on package entrypoints.
- `LOW`: it is unclear whether the symbol is part of the supported public API.

## Remediation
- Add a short TSDoc comment above the exported declaration describing behavior
  and important parameters or return semantics.

## Pass example
```ts
/** Fetch the current user profile from the API. */
export async function loadUser(id: string): Promise<UserProfile> {
  return fetch(`/users/${id}`).then(r => r.json() as Promise<UserProfile>);
}
```

## Fail example
```ts
export async function loadUser(id: string): Promise<UserProfile> {
  return fetch(`/users/${id}`).then(r => r.json() as Promise<UserProfile>);
}
```
