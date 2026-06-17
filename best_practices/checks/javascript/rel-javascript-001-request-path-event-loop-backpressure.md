---
id: rel-javascript-001
title: Request-path code does not block the event loop and preserves backpressure
domain: rel
language: javascript
app-type: [http-service]
status: active
sources:
  - type: article
    title: Matteo Collina's blog & talks
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
---

# rel-javascript-001: Request-path code does not block the event loop and preserves backpressure

## Intent
Prevent Node.js request handling from stalling unrelated work or buffering more data than downstream consumers can absorb.

## Applicability
Applies to Node.js request handlers, middleware, and stream wiring.

## What to inspect
`*Sync` APIs in request paths, heavy synchronous work, stream piping, and backpressure handling.

## Pass criteria
Request-path work uses async APIs and stream wiring preserves backpressure.

## Fail criteria
The diff introduces synchronous blocking work on the main event loop or stream handling that ignores backpressure.

## Do not flag
Startup code and worker-thread code isolated from the main request loop.

## Confidence guidance
`HIGH` when the blocking call or broken stream wiring is directly visible. `MEDIUM` when the helper is only used from request code. `LOW` when execution context is unclear.

## Remediation
Use non-blocking APIs and preserve stream backpressure instead of buffering or synchronous processing.

## Pass example
```js
source.pipe(transform).pipe(dest)
```

## Fail example
```js
const data = fs.readFileSync(path)
```
