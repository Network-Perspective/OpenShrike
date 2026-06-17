---
id: arch-004
title: Runtime work starts from explicit entrypoints instead of import/load side effects
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: Effective Go + Go Code Review Comments
  - type: book
    title: Effective Python
  - type: standard
    title: Error Prone bug patterns documentation
  - type: standard
    title: Google Go Style Guide
---

# arch-004: Runtime work starts from explicit entrypoints instead of import/load side effects

## Intent
Importing or loading a module should define code, not start application work, open connections, or terminate the process unexpectedly.

## Applicability
Applies when the diff changes top-level module/package code or process-entrypoint behavior.

## What to inspect
Top-level statements, static initializers, import-time cross-module work, listener startup, background jobs, and `System.exit`/process termination in non-entrypoint code.

## Pass criteria
Runtime behavior starts from explicit entrypoints and imports remain declarative.

## Fail criteria
The diff introduces import/load-time I/O, process startup, background work, global runtime mutation, or process termination from library or service code.

## Do not flag
True entrypoints, declarations, constants, and lightweight framework registration with no real work.

## Confidence guidance
`HIGH` when the side effect is visible at top level. `MEDIUM` when a helper probably performs the work. `LOW` when the file is itself an intentional executable entrypoint.

## Remediation
Move work to an explicit startup path or entrypoint function.

## Pass example
```javascript
export function startServer() { return app.listen(3000); }
```

## Fail example
```javascript
app.listen(3000);
```
