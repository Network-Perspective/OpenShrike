---
id: rel-008
title: Overload-triggering work and resource consumption are bounded
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: CIS Docker Benchmark & CIS Kubernetes Benchmark
  - type: book
    title: Site Reliability Engineering
    chapter: "Addressing Cascading Failures"
  - type: standard
    title: OWASP Top 10 (2021, and the 2025 update cycle) + OWASP API Security Top 10 (2023)
---

# rel-008: Overload-triggering work and resource consumption are bounded

## Intent
Prevent saturation, memory blowups, and cost explosions caused by unbounded work acceptance or resource use.

## Applicability
Applies to request queues, batch fan-out, container limits, and user-controlled work sizing.

## What to inspect
Queue lengths, size limits, container limits, pagination or batch size controls, and admission behavior under load.

## Pass criteria
Work size and memory or queue growth are visibly bounded, and overload is rejected early.

## Fail criteria
The diff allows unbounded queueing, memory consumption, or caller-controlled work sizing with no visible cap.

## Do not flag
Tiny internal data structures with hard-coded small bounds.

## Confidence guidance
`HIGH` when an unbounded queue or resource path is directly visible. `MEDIUM` when limits may be hidden in deployment config. `LOW` when runtime ownership is partial.

## Remediation
Add admission limits, queue caps, body or batch size limits, and resource ceilings.

## Pass example
```yaml
resources:
  limits:
    memory: 512Mi
queue:
  max_depth: 1000
```

## Fail example
```yaml
queue:
  max_depth: unlimited
```
