---
id: ops-javascript-001
title: Variable-size async fan-out is bounded
domain: ops
language: javascript
app-type:
  - any
status: active
sources:
  - type: article
    title: EventEmitter Anti-Pattern
    author: Matteo Collina
  - type: article
    title: Key Takeaways for Code Review Checks
    author: Matteo Collina
---

# ops-javascript-001: Variable-size async fan-out is bounded

## Intent
Prevent Node.js services from overwhelming downstream dependencies or exhausting their own sockets, handles, or memory.

## Applicability
Applies when changed code starts async work for each item in a variable-size collection or event stream.

## What to inspect
`Promise.all`, async loops, queues, limiters, and whether concurrency is capped.

## Pass criteria
Async fan-out is limited by a queue, semaphore, concurrency limiter, or explicit bounded batching.

## Fail criteria
The diff launches async I/O for a data-sized collection all at once with no visible concurrency control.

## Do not flag
Fixed small tuples of tasks, test code, or clearly bounded one-off startup work.

## Confidence guidance
`HIGH` when the diff clearly fans out variable-size I/O with no limiter. `MEDIUM` when input size is inferred. `LOW` when runtime configuration may bound concurrency elsewhere.

## Remediation
Wrap the work in an explicit limiter or queue and set a bounded in-flight count.

## Pass example
```javascript
const limit = pLimit(4);
await Promise.all(items.map((item) => limit(() => fetchItem(item))));
```

## Fail example
```javascript
await Promise.all(items.map((item) => fetchItem(item)));
```
