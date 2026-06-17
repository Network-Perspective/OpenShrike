---
id: vertical-slice-arch-002
title: Slice changes stay local to the use case
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Vertical Slice Architecture
    author: Jimmy Bogard
    year: 2018
    section: Benefits
---

# vertical-slice-arch-002: Slice changes stay local to the use case

## Intent
In a vertical-slice codebase, a narrow feature change should mostly stay in its owning slice plus a small number of stable seams.

## Applicability
Applies when the repo already uses slices and the diff changes one use case or a small related set of behaviors.

## What to inspect
Touched files in the owning slice and any edits outside it.

## Pass criteria
Most behavior-specific edits stay in the slice and out-of-slice changes are narrow, deliberate, and boundary-driven.

## Fail criteria
One feature change is scattered across unrelated slices or generic shared layers without a durable boundary reason.

## Do not flag
Intentional cross-cutting platform work, schema changes, or shared contract evolution.

## Confidence guidance
`HIGH` when one behavior is visibly scattered. `MEDIUM` when some shared changes might still be justified. `LOW` when the change may be intentionally cross-cutting.

## Remediation
Pull only the behavior-specific code back into the owning slice and keep out-of-slice edits limited to the stable seams this change actually needs.

## Pass example
```text
features/orders/cancel/*
```

## Fail example
```text
controllers/
services/
validators/
repositories/
events/
```
