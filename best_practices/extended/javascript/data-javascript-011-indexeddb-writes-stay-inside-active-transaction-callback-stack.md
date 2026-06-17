---
id: data-javascript-011
title: IndexedDB writes stay inside the active transaction callback stack
domain: data
language: javascript
app-type: [web-frontend]
status: active
sources:
  - type: article
    title: Lydia Hallie / "JavaScript Visualized" series + Jake Archibald - "Tasks, microtasks, queues and schedules"
---

# data-javascript-011: IndexedDB writes stay inside the active transaction callback stack

## Intent
Prevent transaction-inactive failures and lost IndexedDB mutations caused by deferring work too late.

## Applicability
Applies to browser IndexedDB transactions. Return `unknown` when persistence is handled through a helper not shown.

## What to inspect
`IDBTransaction` callbacks, `await`, timers, promise chains, and when object store writes occur.

## Pass criteria
Object store reads and writes occur while the transaction is still active in the original callback turn.

## Fail criteria
Code awaits or defers until after the active callback returns and then tries to continue writing with the old transaction.

## Do not flag
Pure in-memory work that does not touch the IndexedDB transaction after yielding.

## Confidence guidance
`HIGH` when deferred transaction use is explicit. `MEDIUM` when a wrapper may reopen transactions. `LOW` when only helper calls are shown.

## Remediation
Perform IndexedDB operations in the active callback stack or open a new transaction after yielding.

## Pass example
```javascript
const tx = db.transaction("users", "readwrite");
tx.objectStore("users").put(user);
```

## Fail example
```javascript
const tx = db.transaction("users", "readwrite");
await Promise.resolve();
tx.objectStore("users").put(user);
```
