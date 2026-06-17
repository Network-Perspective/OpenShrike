---
id: bp-ops-001
title: Services expose meaningful health signals
domain: ops
language: shared
app-type: [http-service, batch-job, other]
status: active
sources:
  - type: book
    title: Google SRE Book - Site Reliability Engineering
    chapter: 'Chapter 22 "Addressing Cascading Failures"'
  - type: book
    title: Production-Ready Microservices
    author: Susan Fowler
    chapter: 'Chapter 3 "Routing and Discovery"'
  - type: book
    title: Release It!
    author: Michael T. Nygard
    chapter: "2.1 The Outage"
---

# bp-ops-001: Services expose meaningful health signals

## Intent
Liveness should show the process is running. Readiness should show whether the service can actually do its job. Systems that expose only trivial health checks hide dependency failures until traffic is already failing.

## Applicability
Applies to deployable services, workers, APIs, and other long-lived runtime processes with external dependencies.

## What to inspect
Health endpoints, probe wiring, dependency checks, and whether serving-readiness is separate from process-aliveness.

## Pass criteria
The service exposes health signals appropriate to its runtime model, and critical dependencies that govern whether it can accept work are represented in readiness or equivalent traffic-gating checks.

## Fail criteria
A long-lived service exposes no meaningful health signal, uses one trivial success endpoint for both liveness and readiness, or ignores obvious critical dependencies in its serving check.

## Do not flag
Libraries, short-lived batch tools, or optional dependencies that clearly degrade gracefully.

## Confidence guidance
`HIGH` when health behavior and missing dependency checks are directly visible. `MEDIUM` when dependency criticality is inferred. `LOW` when runtime topology is unclear.

## Remediation
Add separate liveness and readiness behavior where supported, and make readiness fail when critical dependencies are unavailable.

## Pass example
```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 8080 }
readinessProbe:
  httpGet: { path: /health/ready, port: 8080 }
```

## Fail example
```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
readinessProbe:
  httpGet: { path: /health, port: 8080 }
```
