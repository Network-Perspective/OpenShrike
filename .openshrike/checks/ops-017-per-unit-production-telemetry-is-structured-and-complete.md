---
id: ops-017
title: Per-unit production telemetry is structured and complete
domain: ops
language: shared
app-type: [http-service, batch-job]
status: active
sources:
  - type: book
    title: Observability Engineering
    year: 2022
---

# ops-017: Per-unit production telemetry is structured and complete

## Intent
Make requests and jobs diagnosable by emitting one machine-parseable record or root span per unit of work with duration, outcome, and stable identifiers.

## Applicability
Applies when the diff adds or changes production request handlers, workers, queue consumers, or cron jobs that emit telemetry.

## What to inspect
Entrypoints, structured log payloads, root spans, duration fields, outcome fields, and request or job identifiers.

## Pass criteria
Each changed production work unit emits structured completion telemetry with duration, outcome, and a stable correlation identifier.

## Fail criteria
The diff emits only narrative log lines or aggregate counters for a work unit, or completion telemetry omits duration, outcome, or stable identifiers.

## Do not flag
Low-level helpers already inside an instrumented parent unit of work.

## Confidence guidance
`HIGH` when the entrypoint and incomplete telemetry are directly visible. `MEDIUM` when a shared wrapper may add fields. `LOW` when framework auto-instrumentation is unclear.

## Remediation
Emit one structured event or root span per work unit and include duration, outcome, and a stable identifier.

## Pass example
```json
{
  "request_id": "9f7c1d",
  "path": "/checkout",
  "duration_ms": 184,
  "status": 500
}
```

## Fail example
```text
accepted checkout request
finished checkout request
```
