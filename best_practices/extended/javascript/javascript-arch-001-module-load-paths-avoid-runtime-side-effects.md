---
id: javascript-arch-001
title: Module load paths avoid runtime side effects
domain: arch
language: javascript
app-type: [http-service, batch-job, cli, library]
status: active
sources: []
---

# javascript-arch-001: Module load paths avoid runtime side effects

## Intent
Importing a module should not silently start application work.

## Applicability
Applies to Node.js services, workers, CLIs, and reusable packages.

## What to inspect
Top-level code, server start, listener registration, timers, network or file I/O.

## Pass criteria
Modules export declarations, handlers, or factories and runtime behavior starts from explicit entrypoints.

## Fail criteria
Importing the module starts servers, schedules jobs, opens connections, or performs external I/O.

## Do not flag
CLI entry files, constants, and lightweight framework wiring.

## Confidence guidance
`HIGH` when the side effect is top-level and direct. `MEDIUM` when helper bodies are partly out of scope. `LOW` when the file is an intentional entrypoint.

## Remediation
Move runtime work into a startup function or entrypoint.

## Pass example
```javascript
export function createApp() { return app; }
```

## Fail example
```javascript
createApp().listen(3000);
```
