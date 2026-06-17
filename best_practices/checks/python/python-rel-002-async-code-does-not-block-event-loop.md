---
id: python-rel-002
title: Async code does not block the event loop
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: documentation
    title: Python asyncio docs, "Developing with asyncio"
  - type: article
    title: "asyncio: We Did It Wrong"
    author: Lynn Root
    section: "Blocking Calls in Async Code"
---

# python-rel-002: Async code does not block the event loop

## Intent
Keep `async def` paths from smuggling blocking work onto the event-loop thread.

## Applicability
Applies to asyncio, FastAPI, Starlette, aiohttp, and other async Python code.

## What to inspect
Async functions, blocking libraries, synchronous sleeps, and offload boundaries.

## Pass criteria
Async paths use async-aware clients or explicitly move blocking work to a worker thread or executor.

## Fail criteria
The diff adds blocking network, disk, subprocess, or sleep calls directly inside `async def` code.

## Do not flag
Tiny in-memory work or explicit `to_thread` or executor handoff.

## Confidence guidance
`HIGH` when the blocking call is directly visible. `MEDIUM` when a helper looks blocking but is out of scope. `LOW` when async ownership is unclear.

## Remediation
Use async-aware APIs or move the blocking work behind an explicit sync boundary.

## Pass example
```python
await asyncio.to_thread(Path(path).read_text)
```

## Fail example
```python
time.sleep(1)
```
