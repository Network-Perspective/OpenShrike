---
id: data-rust-034
title: Handle zero-sized types explicitly in unsafe generic storage
domain: data
language: rust
app-type: [any]
status: active
sources:
  - type: book
    title: The Rustonomicon
---

# data-rust-034: Handle zero-sized types explicitly in unsafe generic storage

## Intent
Prevent undefined behavior in unsafe generic containers that assume every type has ordinary allocation semantics.

## Applicability
Applies to unsafe generic Rust collections or allocators. Return `unknown` when generic storage internals are hidden.

## What to inspect
Allocation math, pointer arithmetic, deallocation logic, and special cases for `size_of::<T>() == 0`.

## Pass criteria
Unsafe generic storage explicitly handles zero-sized types without fake allocation, invalid offset math, or invalid deallocation.

## Fail criteria
Generic unsafe storage treats zero-sized types like ordinary allocated elements and performs invalid pointer arithmetic or deallocation.

## Do not flag
Safe standard-library containers or generic code that never manipulates raw storage.

## Confidence guidance
`HIGH` when raw generic storage ignores zero-sized types. `MEDIUM` when helper abstractions may already special-case them. `LOW` when only type parameters are visible.

## Remediation
Add explicit zero-sized-type handling for allocation, pointer math, and drop or deallocation paths.

## Pass example
```rust
if mem::size_of::<T>() == 0 { return NonNull::dangling(); }
```

## Fail example
```rust
let layout = Layout::array::<T>(cap).unwrap();
alloc(layout)
```
