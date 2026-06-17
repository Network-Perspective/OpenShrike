---
id: ops-030
title: Service processes stay foreground and are externally supervised
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: The Twelve-Factor App
    section: VIII. Concurrency
---

# ops-030: Service processes stay foreground and are externally supervised

## Intent
Keep restart, log capture, and shutdown behavior predictable by letting the platform supervise foreground processes.

## Applicability
Applies when the diff changes service startup code, process wrappers, or daemonization behavior for long-running services.

## What to inspect
Startup scripts, daemon flags, `nohup`, PID file management, and foreground versus self-backgrounding behavior.

## Pass criteria
The service runs in the foreground and relies on an external process manager or container runtime for supervision.

## Fail criteria
The diff adds daemonization, self-backgrounding, or PID file management as part of the application lifecycle.

## Do not flag
External service-manager units that supervise a foreground process.

## Confidence guidance
`HIGH` when daemonization or PID-file writes are directly visible. `MEDIUM` when wrappers imply it. `LOW` when lifecycle behavior is hidden.

## Remediation
Run the process in the foreground and let the platform manage supervision.

## Pass example
```bash
exec ./bin/worker
```

## Fail example
```bash
./bin/worker --daemonize --pidfile /var/run/worker.pid
```
