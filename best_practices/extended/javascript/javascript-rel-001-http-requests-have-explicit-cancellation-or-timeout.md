---
id: javascript-rel-001
title: Outbound HTTP requests have explicit cancellation or timeout
domain: rel
language: javascript
app-type: [any]
status: active
sources: []
---

# javascript-rel-001: Outbound HTTP requests have explicit cancellation or timeout

## Intent
Bound JavaScript outbound HTTP work so hanging calls do not accumulate on the event loop or worker pool.

## Applicability
Applies to `fetch`, Axios, got, undici, and similar clients.

## What to inspect
Abort signals, timeouts, and shared client configuration.

## Pass criteria
The changed path has explicit abort or timeout behavior.

## Fail criteria
The diff adds remote calls with no visible timeout or abort path.

## Do not flag
Tests and obvious offline scripts.

## Confidence guidance
`HIGH` when an unbounded request is directly visible. `MEDIUM` when a wrapper may own the timeout. `LOW` when ownership is unclear.

## Remediation
Add explicit timeout or `AbortSignal` handling.

## Pass example
```ts
await fetch(url, { signal: AbortSignal.timeout(5000) });
```

## Fail example
```ts
await fetch(url);
```
