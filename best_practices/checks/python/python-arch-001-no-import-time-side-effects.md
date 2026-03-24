# PYTHON-ARCH-001: Import paths avoid runtime side effects

## Intent

Importing a module should define code, not execute production work. Import-time
I/O, network calls, process startup, and global state mutation make tests
fragile and couple runtime behavior to import order.

## Applicability

Applies to Python packages, services, CLIs, workers, and libraries with module
imports beyond a single script.

Return `unknown` when the repo is intentionally script-style and not organized
as importable modules.

## Strategy

`static`

## What to inspect

1. Review top-level module code added or changed in the diff.
2. Look for network calls, file writes, database access, process startup, or
   background threads executed at import time.

## Pass criteria

- Top-level code is limited to declarations, constants, lightweight setup, and
  framework registration that does not perform real work.
- Runtime behavior starts from explicit entry points such as `main()`,
  application factories, or CLI handlers.

## Fail criteria

- Importing the module opens connections, runs migrations, starts threads, or
  performs external I/O.
- Business logic depends on module import order or global singleton setup.

## Do not flag

- Constant definitions, logger creation, lightweight dataclass/model
  declarations, or framework route decoration.
- `if __name__ == "__main__":` entry points.

## Evidence to collect

- The top-level side-effecting statement.
- The external action it performs.

## Confidence guidance

- `HIGH`: external work is directly visible at module top level.
- `MEDIUM`: helper calls likely have side effects, but the helper body is partly
  out of scope.
- `LOW`: prefer `unknown` if the module is intentionally a one-shot script.

## Remediation

- Move runtime work into an explicit function or application factory.
- Keep imports declarative and side-effect free.
