---
id: ops-024
title: Automation that changes production state fails safe and verifies recovery before restoring traffic
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Google SRE Workbook (free online)
  - type: book
    title: The Site Reliability Workbook
---

# ops-024: Automation that changes production state fails safe and verifies recovery before restoring traffic

## Intent
Prevent automation from causing or extending outages by requiring safety checks before disruptive actions and health verification before traffic returns.

## Applicability
Applies when the diff adds or changes automation that drains traffic, restarts components, changes live config, or otherwise mutates production state.

## What to inspect
Preflight checks, destructive actions, abort paths, readiness verification, undrain steps, and timeout or fallback behavior.

## Pass criteria
The automation checks whether the action is safe before running, aborts or escalates when safety is not proven, and verifies recovery before re-enabling traffic or serving responsibility.

## Fail criteria
The diff adds state-changing automation that acts blindly, continues after failed safety checks, or restores traffic immediately with no health verification.

## Do not flag
Read-only diagnostics, dry runs, or offline maintenance tasks that never re-enter service.

## Confidence guidance
`HIGH` when both the mutation and missing checks are visible. `MEDIUM` when checks are delegated to helpers. `LOW` when execution context is only partly visible.

## Remediation
Add explicit preflight safety checks, bounded execution, and post-action health verification before restoring traffic.

## Pass example
```yaml
steps:
  - estimateImpact: api-3
  - restart: api-3
  - waitForReadiness: api-3
  - undrain: api-3
```

## Fail example
```yaml
steps:
  - restart: api-3
  - undrain: api-3
```
