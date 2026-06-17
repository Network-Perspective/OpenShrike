---
id: arch-003
title: Environment and configuration are read, modeled, and validated at the boundary
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Tidy First?
    author: Kent Beck
    chapter: Ch. 10 "Explicit Parameters"
---

# arch-003: Environment and configuration are read, modeled, and validated at the boundary

## Intent
Runtime configuration should be loaded close to startup, validated, and passed inward as an owned config boundary rather than read ad hoc deep inside logic.

## Applicability
Applies when the diff introduces or changes environment-variable reads, config lookups, or configuration objects beyond one-off bootstrap code.

## What to inspect
Calls to environment/config APIs, bound config types, and whether the reads happen in startup or deep inside application code.

## Pass criteria
Configuration is modeled explicitly, validated near startup, and passed inward through typed settings or constructor parameters.

## Fail criteria
The diff reads raw process configuration from internal routines or lower-level helpers, or parses critical config ad hoc without a modeled boundary.

## Do not flag
Dedicated config modules, startup wiring, and one-off bootstrap toggles.

## Confidence guidance
`HIGH` when lower-level logic directly reads environment/config APIs. `MEDIUM` when the boundary is inferred from file structure. `LOW` when config conventions are unclear.

## Remediation
Read config at the boundary, validate it there, and inject the owned settings object or explicit values inward.

## Pass example
```python
api_url = settings.api_url
worker = Worker(api_url)
```

## Fail example
```python
class Worker:
    def run(self):
        call_remote(os.getenv("API_URL"))
```
