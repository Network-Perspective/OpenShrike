---
id: rel-python-002
title: Event-loop ownership stays at application boundaries
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: documentation
    title: Python asyncio docs, Developing with asyncio
  - type: article
    title: "asyncio: We Did It Wrong"
    author: Lynn Root
---

# rel-python-002: Event-loop ownership stays at application boundaries

## Intent
Avoid nested loop bugs and library helpers that secretly create or run their own event loops.

## Applicability
Applies to Python code calling `asyncio.run`, `new_event_loop`, `set_event_loop`, or `run_until_complete`.

## What to inspect
Loop-control APIs and whether they appear in entry points or reusable helpers.

## Pass criteria
Only explicit application entry points own loop creation and top-level execution.

## Fail criteria
The diff creates or drives an event loop from a reusable helper or library module.

## Do not flag
Main modules, CLI entry points, and tests that deliberately own an isolated loop.

## Confidence guidance
`HIGH` when loop creation in a helper is directly visible. `MEDIUM` when the file role is inferred. `LOW` when entry-point ownership is unclear.

## Remediation
Move event-loop control to the application's entry point and keep helpers async.

## Pass example
```python
if __name__ == "__main__":
    asyncio.run(main())
```

## Fail example
```python
def load_user():
    return asyncio.new_event_loop().run_until_complete(fetch())
```
