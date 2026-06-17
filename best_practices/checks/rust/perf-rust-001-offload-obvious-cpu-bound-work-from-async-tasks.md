---
id: perf-rust-001
title: Offload obvious CPU-bound work from async tasks
domain: perf
language: rust
app-type: [any]
status: active
sources:
  - type: article
    title: Tokio documentation and Alice Ryhl's blog "What is blocking?"
---

# perf-rust-001: Offload obvious CPU-bound work from async tasks

## Intent
Prevent compute-heavy work from consuming executor threads that should stay responsive to async events.

## Applicability
Applies when changed async Rust code performs obviously expensive computation, such as large batch loops, parsing or transforming very large collections, compression, hashing, or similar CPU-heavy work. Return `unknown` if the work is trivial, the data size is not visible, or the code is not on an async execution path.

## What to inspect
Changed `async fn` bodies and async task closures for long computation loops, parallel iterator use, or other compute-heavy code that runs inline without `spawn_blocking`, `rayon::spawn`, or a dedicated thread.

## Pass criteria
The expensive computation is moved to `rayon::spawn`, `tokio::task::spawn_blocking`, or another non-executor thread, and the async code awaits the result without blocking the runtime thread.

## Fail criteria
Fail when an async function performs obviously expensive CPU-bound work inline on the executor thread with no offload mechanism.

## Do not flag
Do not flag small in-memory calculations, cheap loops over tiny collections, or synchronous worker code that does not run on an async runtime. Do not flag a small number of CPU-bound tasks that are already offloaded with `spawn_blocking`.

## Confidence guidance
`HIGH` when the diff shows a clearly large or compute-heavy loop inside async code, or directly runs Rayon parallel iterators on the runtime thread. `MEDIUM` when the work appears expensive from names and collection sizes but the full cost is partly inferred. `LOW` when cost depends on runtime data not visible in the repo.

## Remediation
Move the CPU-bound section to `rayon::spawn` or `tokio::task::spawn_blocking`, then await the result from the async caller.

## Pass example
```rust
async fn checksum(data: Vec<u8>) -> u64 {
    tokio::task::spawn_blocking(move || {
        data.iter().fold(0_u64, |acc, b| acc.wrapping_add(*b as u64))
    })
    .await
    .expect("blocking task panicked")
}
```

## Fail example
```rust
async fn checksum(data: Vec<u8>) -> u64 {
    let mut sum = 0_u64;
    for byte in data {
        sum = sum.wrapping_add(byte as u64);
    }
    sum
}
```
