---
id: rel-rust-001
title: Async Rust does not block runtimes or hold blocking state across await
domain: rel
language: rust
app-type: [any]
status: active
sources:
  - type: documentation
    title: Clippy lint documentation
  - type: article
    title: What is blocking?
    author: Alice Ryhl
---

# rel-rust-001: Async Rust does not block runtimes or hold blocking state across await

## Intent
Keep Rust async tasks from stalling executor threads or suspending while holding blocking state that cannot tolerate suspension.

## Applicability
Applies to async Rust code using Tokio or similar runtimes.

## What to inspect
Blocking waits, sync I/O, blocking mutex guards or `RefCell` borrows across `await`, and `Send` requirements for exposed futures.

## Pass criteria
Async tasks use async-aware waits, move blocking work off the runtime, and release blocking guards before `await`.

## Fail criteria
The diff blocks an executor thread, holds blocking state across `await`, or exposes futures that unexpectedly lose required `Send` semantics.

## Do not flag
Purely synchronous code outside async runtimes.

## Confidence guidance
`HIGH` when the blocking or held-state hazard is directly visible. `MEDIUM` when helper behavior is partly hidden. `LOW` when runtime context is incomplete.

## Remediation
Use async-aware APIs, `spawn_blocking` or equivalent for blocking work, and drop guards before suspension.

## Pass example
```rust
drop(lock);
tokio::time::sleep(Duration::from_secs(1)).await;
```

## Fail example
```rust
let guard = mutex.lock().unwrap();
tokio::time::sleep(Duration::from_secs(1)).await;
```
