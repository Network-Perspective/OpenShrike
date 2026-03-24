# PYTHON-REL-002: Async code does not block the event loop

## Intent

`async def` code should not smuggle synchronous blocking work into the event
loop. Blocking calls inside async paths create latency spikes and head-of-line
blocking that are hard to diagnose.

## Applicability

Applies when the diff changes `asyncio`, FastAPI, Starlette, aiohttp, async
workers, or other async Python code.

Return `unknown` when the runtime model is not clearly async.

## Strategy

`heuristic`

## What to inspect

1. Review async functions and handlers in the diff.
2. Look for synchronous network clients, blocking sleeps, CPU-heavy loops, or
   file I/O executed directly inside async paths.

## Pass criteria

- Async paths use async-aware clients and waits.
- Blocking work is moved to worker pools or explicit sync boundaries.

## Fail criteria

- `time.sleep`, synchronous `requests`, blocking DB calls, or heavy CPU work
  are introduced directly inside async paths without isolation.

## Do not flag

- Short in-memory work inside async functions.
- Explicit `run_in_executor` or worker-pool handoff.
- Sync frameworks using ordinary functions, not async handlers.

## Evidence to collect

- The async function.
- The blocking call inside it.

## Confidence guidance

- `HIGH`: blocking work in an async function is directly visible.
- `MEDIUM`: the client or helper is likely blocking, but implementation is
  partly out of scope.
- `LOW`: prefer `unknown` if async usage is incidental.

## Remediation

- Use async-aware clients.
- Move blocking work to explicit worker pools or sync boundaries.
