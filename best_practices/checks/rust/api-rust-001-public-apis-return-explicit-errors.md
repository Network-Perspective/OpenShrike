---
id: api-rust-001
title: Rust public APIs return explicit recoverable errors and keep public error context
domain: api
language: rust
app-type: [library]
status: active
sources:
  - type: documentation
    title: Clippy lint documentation
  - type: documentation
    title: Rust API Guidelines
  - type: book
    title: The Rustonomicon
---

# api-rust-001: Rust public APIs return explicit recoverable errors and keep public error context

## Intent
Rust callers should get recoverable failures as `Err` with source context, and panics should not escape boundaries that promise recoverable failure or C ABI safety.

## Applicability
Applies to public Rust library APIs that return `Result`, custom public error types, and `extern "C"` FFI boundaries.

## What to inspect
`Result`-returning functions, `panic!` in public failure paths, public error enum or struct definitions, `source()` preservation, and FFI wrappers that could unwind.

## Pass criteria
Public recoverable failures return `Err` with a concrete public error type that preserves source context, and `extern "C"` boundaries prevent Rust panics from unwinding across the ABI.

## Fail criteria
A `Result` API panics on an expected failure path, erases source context during error mapping, exposes only stringly or opaque dynamic errors as the public contract, or lets a panic cross an `extern "C"` boundary.

## Do not flag
Tests, impossible invariant checks with a nearby proof, or private application-only code that is not itself the reusable public API.

## Confidence guidance
`HIGH` when the panic path or public error type is directly visible. `MEDIUM` when helper layers may preserve context elsewhere. `LOW` when the boundary is private or incomplete.

## Remediation
Return `Err` for recoverable failures, preserve `source()` when mapping errors, and catch or abort before a panic crosses an FFI boundary.

## Pass example
```rust
pub fn parse(input: &str) -> Result<Item, ParseError> { ... }
```

## Fail example
```rust
pub fn parse(input: &str) -> Result<Item, String> {
    panic!("bad input")
}
```
