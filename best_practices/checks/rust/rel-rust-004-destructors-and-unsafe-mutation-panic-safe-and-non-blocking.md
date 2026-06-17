---
id: rel-rust-004
title: Destructors and unsafe mutation remain panic-safe and non-blocking
domain: rel
language: rust
app-type: [any]
status: active
sources:
  - type: guideline
    title: Rust API Guidelines
  - type: book
    title: The Rustonomicon
---

# rel-rust-004: Destructors and unsafe mutation remain panic-safe and non-blocking

## Intent
Avoid aborts, double drops, and hidden blocking during `Drop` or panic paths in unsafe mutation code.

## Applicability
Applies to Rust `Drop` implementations, unsafe collection mutation, and manual cleanup code.

## What to inspect
`Drop`, panic paths during unsafe mutation, `set_len`, manual field cleanup, and blocking teardown in destructors.

## Pass criteria
Destructors avoid fallible or blocking cleanup, and unsafe mutation restores safe state before panics can escape.

## Fail criteria
The diff adds blocking or panic-prone destructor work, or leaves unsafe mutation paths vulnerable to double-drop or invalid state on panic.

## Do not flag
Explicit non-`Drop` cleanup methods that the caller owns.

## Confidence guidance
`HIGH` when the drop or unsafe panic hazard is directly visible. `MEDIUM` when helper ownership is inferred. `LOW` when mutation boundaries are partial.

## Remediation
Keep `Drop` best-effort and non-blocking, and restore invariants before any panic can escape unsafe mutation code.

## Pass example
```rust
pub fn close(self) -> Result<()> { self.join_handle.join().map_err(...)}
```

## Fail example
```rust
impl Drop for Worker { fn drop(&mut self) { self.join_handle.join().unwrap(); } }
```
