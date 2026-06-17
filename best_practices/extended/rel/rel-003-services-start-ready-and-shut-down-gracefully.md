---
id: rel-003
title: Services start ready and shut down gracefully
domain: rel
language: shared
app-type: [http-service]
status: active
sources:
  - type: book
    title: Release It!
    author: Michael T. Nygard
  - type: article
    title: The Twelve-Factor App
    section: IX. Disposability
---

# rel-003: Services start ready and shut down gracefully

## Intent
Avoid taking traffic before the service is ready and avoid dropping in-flight work on normal shutdown.

## Applicability
Applies to service bootstrap, readiness signaling, signal handlers, and shutdown paths.

## What to inspect
Traffic acceptance, readiness gates, signal handling, in-flight drain logic, and shutdown timeouts.

## Pass criteria
The process becomes routable only after critical startup completes and drains or cancels in-flight work deliberately on shutdown.

## Fail criteria
The diff accepts traffic before readiness or exits abruptly on normal deploy or scale-down signals.

## Do not flag
One-shot batch tools and scripts that do not serve traffic.

## Confidence guidance
`HIGH` when readiness or shutdown behavior is directly visible. `MEDIUM` when hooks are partly framework-owned. `LOW` when lifecycle ownership is hidden.

## Remediation
Gate readiness on real startup completion and handle termination by draining or canceling work deliberately.

## Pass example
```go
<-ready
server.ListenAndServe()
```

## Fail example
```go
go initCriticalDependencies()
server.ListenAndServe()
```
