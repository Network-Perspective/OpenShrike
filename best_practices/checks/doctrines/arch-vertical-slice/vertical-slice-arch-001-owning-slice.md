---
id: vertical-slice-arch-001
title: New use cases land inside an owning slice
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Vertical Slice Architecture
    author: Jimmy Bogard
    year: 2018
---

# vertical-slice-arch-001: New use cases land inside an owning slice

## Intent
In a slice-oriented repo, one request or workflow should have a visible owning slice instead of being spread across horizontal shared layers.

## Applicability
Applies when the repo already shows a vertical-slice or feature-first structure.

## What to inspect
Changed handlers, endpoints, validators, request models, and where they live.

## Pass criteria
Feature-specific request handling, validation, and orchestration code live together inside one owning slice.

## Fail criteria
The diff implements a new use case mainly by adding feature logic to shared controllers, services, or repositories.

## Do not flag
Thin framework registration and shared infrastructure.

## Confidence guidance
`HIGH` when the repo is clearly slice-oriented and the new feature still lands in horizontal layers. `MEDIUM` when slice intent is implied. `LOW` when the repo is consistently layer-based.

## Remediation
Move the newly added use-case-specific code under the owning slice, leaving thin framework registration and genuine shared infrastructure in place.

## Pass example
```text
features/users/register/
```

## Fail example
```text
controllers/users/
services/users/
repositories/users/
```
