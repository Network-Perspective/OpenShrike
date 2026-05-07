# JAVASCRIPT-ARCH-001: Module load paths avoid runtime side effects

## Intent

Importing a module should not silently start application work. Module-load side
effects make tests brittle, couple behavior to import order, and create hard to
debug startup issues.

## Applicability

Applies to Node.js services, CLIs, workers, and reusable packages.

Return `unknown` when the repo is intentionally a single script with no module
reuse.

## Strategy

`static`

## What to inspect

1. Review top-level module code in changed files.
2. Look for network calls, file writes, process startup, listener registration,
   timers, or background jobs started at module load.

## Pass criteria

- Modules export declarations, handlers, factories, or pure helpers.
- Runtime behavior starts from explicit entry points.

## Fail criteria

- Importing the module starts servers, schedules jobs, opens connections, or
  performs external I/O.

## Do not flag

- Route registration, constant declarations, and lightweight framework wiring
  that do not perform external work.
- CLI entry files that intentionally execute when run directly.

## Evidence to collect

- The top-level side-effecting statement.
- The external action it performs.

## Confidence guidance

- `HIGH`: the runtime side effect is directly visible at module load.
- `MEDIUM`: helper functions likely perform side effects, but their bodies are
  partly out of scope.
- `LOW`: prefer `unknown` if the file is clearly an executable entry point.

## Remediation

- Move work into explicit startup functions or handlers.
- Keep imported modules declarative.
