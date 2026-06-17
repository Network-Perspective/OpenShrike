---
id: ops-029
title: Operational logs use the platform collection path or bounded file retention
domain: ops
language: shared
app-type: [http-service]
status: active
sources:
  - type: book
    title: Release It!
    author: Michael T. Nygard
  - type: article
    title: The Twelve-Factor App
---

# ops-029: Operational logs use the platform collection path or bounded file retention

## Intent
Prevent observability gaps and disk exhaustion by either using the runtime platform's log collection path or rotating on-host file logs with explicit bounds.

## Applicability
Applies when the diff changes production logging configuration for long-running services.

## What to inspect
Stdout or stderr logging, file appenders, retention settings, rotation config, and whether the app manages host log files itself.

## Pass criteria
Operational logs go to stdout or stderr for platform collection, or any deliberate file-based logging has explicit rotation and bounded retention.

## Fail criteria
The diff introduces primary file-based production logging with no bounded rotation or retention.

## Do not flag
Managed platform logging that already collects stdout or stderr, or host-level rotation config clearly checked into the repo.

## Confidence guidance
`HIGH` when the logging sink and missing rotation are direct. `MEDIUM` when rotation may exist in another repo file. `LOW` when logging deployment is opaque.

## Remediation
Prefer stdout or stderr for service logs, or add explicit rotation and retention when on-host file logs are intentionally used.

## Pass example
```python
handler = logging.StreamHandler(sys.stdout)
logging.getLogger().addHandler(handler)
```

## Fail example
```python
logging.basicConfig(filename="/var/log/app/app.log")
```
