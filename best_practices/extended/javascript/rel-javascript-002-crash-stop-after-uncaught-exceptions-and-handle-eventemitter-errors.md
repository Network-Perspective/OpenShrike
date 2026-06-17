---
id: rel-javascript-002
title: Processes crash-stop after uncaught exceptions and EventEmitter error paths are handled
domain: rel
language: javascript
app-type: [http-service, batch-job, cli]
status: active
sources:
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
---

# rel-javascript-002: Processes crash-stop after uncaught exceptions and EventEmitter error paths are handled

## Intent
Avoid continuing in corrupted process state or crashing unexpectedly because emitted errors have no listeners.

## Applicability
Applies to Node.js process-level exception handlers and custom `EventEmitter` usage.

## What to inspect
`uncaughtException` handlers, restart policy assumptions, and emitters that can raise `error`.

## Pass criteria
Unhandled process exceptions terminate the process after last-resort logging, and emitters that can emit `error` have listeners.

## Fail criteria
The diff swallows `uncaughtException` and continues running, or emits `error` on an emitter with no listener path.

## Do not flag
Emitter wrappers that visibly attach listeners in the same scope.

## Confidence guidance
`HIGH` when the unsafe handler or missing listener is directly visible. `MEDIUM` when emitter setup is partly elsewhere. `LOW` when lifecycle ownership is incomplete.

## Remediation
Crash-stop after `uncaughtException` handling and attach explicit `error` listeners to emitters that may emit them.

## Pass example
```js
process.on('uncaughtException', err => { logger.error(err); process.exit(1); })
```

## Fail example
```js
process.on('uncaughtException', err => logger.error(err))
```
