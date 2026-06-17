---
id: data-rust-033
title: Initialize raw or vector storage before making elements visible
domain: data
language: rust
app-type: [any]
status: active
sources:
  - type: book
    title: The Rustonomicon
---

# data-rust-033: Initialize raw or vector storage before making elements visible

## Intent
Prevent undefined behavior from exposing uninitialized Rust storage as live elements.

## Applicability
Applies to unsafe Rust manipulating raw storage or vector internals. Return `unknown` when unsafe details are hidden.

## What to inspect
`set_len`, raw pointers, `MaybeUninit`, writes into capacity, and when elements become logically initialized.

## Pass criteria
Unsafe code fully initializes memory before adjusting length or otherwise exposing elements to safe code.

## Fail criteria
Code marks elements as initialized before writing them or reads or drops uninitialized storage.

## Do not flag
Safe Rust collection APIs that already preserve initialization guarantees.

## Confidence guidance
`HIGH` when `set_len` or raw pointers make uninitialized data visible. `MEDIUM` when helper invariants may exist off-screen. `LOW` when the unsafe block is incomplete in the diff.

## Remediation
Use `MaybeUninit` patterns and only expose elements after successful initialization.

## Pass example
```rust
ptr.write(value);
vec.set_len(len + 1);
```

## Fail example
```rust
vec.set_len(len + 1);
ptr.write(value);
```
