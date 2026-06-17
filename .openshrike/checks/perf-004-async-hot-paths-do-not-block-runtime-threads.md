---
id: perf-004
title: Async hot paths do not block runtime threads
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Performance Excuses Debunked
    author: Casey Muratori
  - type: article
    title: What Is Blocking?
    author: Alice Ryhl
---

# perf-004: Async hot paths do not block runtime threads

## Intent
Prevent event loops and async workers from stalling behind synchronous I/O, blocking sleeps, or obviously heavy compute.

## Applicability
Applies when the diff adds or changes `async` functions, coroutine handlers, promise-based request paths, event-loop workers, or other repository code that is explicitly asynchronous. Return `unknown` if the repository does not use async concurrency for the changed path or if the code is a startup script, CLI, or test helper outside a hot path.

## What to inspect
Async functions and handlers, synchronous clients used inside them, blocking sleep calls, synchronous filesystem access, large compute loops, and any explicit offloading to worker threads or executors.

## Pass criteria
Direct evidence shows the async path uses non-blocking APIs, awaits async clients, or explicitly offloads unavoidable blocking I/O or CPU-heavy work behind a visible executor or thread boundary.

## Fail criteria
The diff introduces synchronous I/O, blocking sleeps, or obviously expensive inline computation directly inside an async request or worker path, with no repository evidence of explicit offloading.

## Do not flag
Do not flag tests, one-off scripts, startup code, trivial in-memory work, or intentional offloading through `to_thread`, an executor, `spawn_blocking`, or a worker pool.

## Confidence guidance
`HIGH` when a blocking API or heavy inline loop is directly visible inside an async handler or task. `MEDIUM` when the blocking behavior is inferred from a synchronous wrapper. `LOW` when whether the helper blocks depends on implementation outside the repository.

## Remediation
Replace the blocking call with a non-blocking client, or move the work behind an explicit executor boundary.

## Pass example
```python
async def fetch_profile(client, user_id):
    response = await client.get(f"https://api.example.com/users/{user_id}")
    return response.json()
```

## Fail example
```python
import requests

async def fetch_profile(user_id):
    response = requests.get(f"https://api.example.com/users/{user_id}")
    return response.json()
```
