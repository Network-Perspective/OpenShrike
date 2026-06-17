---
id: rel-python-001
title: Coroutine and task lifecycles are explicitly owned
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: documentation
    title: 'Python asyncio docs, "Developing with asyncio"'
  - type: article
    title: "asyncio: We Did It Wrong"
    author: Lynn Root
---

# rel-python-001: Coroutine and task lifecycles are explicitly owned

## Intent
Prevent coroutine work from never running or background tasks from being abandoned without cancellation or failure handling.

## Applicability
Applies to asyncio coroutine calls and `asyncio.create_task(...)` usage.

## What to inspect
Calls to async functions, `create_task`, and whether the coroutine or task is awaited, returned, or registered with an owner.

## Pass criteria
Coroutine results are awaited or scheduled deliberately, and created tasks have a visible owner.

## Fail criteria
The diff drops coroutine objects or starts tasks and immediately forgets their handles.

## Do not flag
`TaskGroup`-owned tasks and explicit return of the task to a caller.

## Confidence guidance
`HIGH` when the dropped coroutine or orphaned task is directly visible. `MEDIUM` when ownership may exist in a helper. `LOW` when async lifecycle is incomplete.

## Remediation
Await or schedule coroutine objects explicitly and store or return task handles to an owner.

## Pass example
```python
task = asyncio.create_task(run())
tasks.add(task)
```

## Fail example
```python
asyncio.create_task(run())
```
