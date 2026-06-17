---
id: ops-018
title: Cross-boundary work preserves correlation and dependency attribution
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Microservices
    author: Sam Newman
    year: 2021
  - type: book
    title: Google SRE Workbook
  - type: book
    title: Observability Engineering
    year: 2022
---

# ops-018: Cross-boundary work preserves correlation and dependency attribution

## Intent
Make cross-process failures and slowdowns traceable to the specific dependency hop that caused them.

## Applicability
Applies when the diff adds or changes outbound HTTP, RPC, queue, or message-boundary work inside a production flow.

## What to inspect
Request headers, message metadata, client wrappers, trace propagation, and spans or metrics around dependency calls.

## Pass criteria
The changed boundary forwards correlation or trace context and emits attributable telemetry for the dependency hop or meaningful substep.

## Fail criteria
The diff introduces cross-boundary work without context propagation or without a visible way to attribute latency or failures to the dependency hop.

## Do not flag
Same-process helper calls or frameworks with clearly configured automatic propagation and dependency instrumentation.

## Confidence guidance
`HIGH` when propagation or attribution is clearly present or absent. `MEDIUM` when shared wrappers may provide it. `LOW` when auto-instrumentation is not visible.

## Remediation
Forward the current trace or correlation context and instrument the dependency boundary with attributable telemetry.

## Pass example
```http
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
x-request-id: 9f7c1d
```

## Fail example
```typescript
await fetch(url, { method: "POST", body });
```
