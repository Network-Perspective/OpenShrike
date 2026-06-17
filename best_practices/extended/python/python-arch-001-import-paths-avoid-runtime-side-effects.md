---
id: python-arch-001
title: Import paths avoid runtime side effects
domain: arch
language: python
app-type: [http-service, cli, batch-job, library]
status: active
sources: []
---

# python-arch-001: Import paths avoid runtime side effects

## Intent
Importing a module should define code, not execute production work.

## Applicability
Applies to Python packages, services, CLIs, workers, and libraries with importable modules.

## What to inspect
Top-level file I/O, network calls, process startup, DB access, threads, and global mutation.

## Pass criteria
Top-level code is limited to declarations and lightweight setup.

## Fail criteria
Importing the module opens connections, runs migrations, starts threads, or performs external I/O.

## Do not flag
Constants, logger creation, lightweight decorators, and `if __name__ == "__main__":` entrypoints.

## Confidence guidance
`HIGH` when the external work is visible at top level. `MEDIUM` when a helper likely has side effects. `LOW` when the file is an intentional one-shot script.

## Remediation
Move the work into an explicit function or application factory.

## Pass example
```python
def create_app():
    return app
```

## Fail example
```python
db.connect()
```
