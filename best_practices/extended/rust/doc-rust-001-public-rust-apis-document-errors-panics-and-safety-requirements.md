---
id: doc-rust-001
title: Public Rust APIs document errors, panics, and safety requirements
domain: doc
language: rust
app-type: [library]
status: active
sources:
  - type: standard
    title: Rust API Guidelines
  - type: book
    title: The Rust Programming Language
---

# doc-rust-001: Public Rust APIs document errors, panics, and safety requirements

## Intent
Prevent callers from discovering Rust API failure modes only in production.
Without this check, public APIs hide panic conditions, undocumented errors, and
`unsafe` preconditions that lead to misuse and latent bugs.

## Applicability
Applies when the diff adds or changes a public function, method, trait method,
constructor, or `unsafe` item in a library crate that can return an error,
panic, or impose caller safety requirements. Return `unknown` if the item is
private, not user-facing, or the change does not affect behavior or docs.

## What to inspect
Rustdoc comments on changed public items, especially `# Errors`, `# Panics`,
and `# Safety` sections, plus the implementation for visible panic paths,
returned `Result`s, and `unsafe` contracts.

## Pass criteria
- The item's docs explicitly describe the relevant error cases, panic
  conditions, and any caller obligations for safe use.

## Fail criteria
- The diff adds or changes a public API with visible error returns, panic
  paths, or `unsafe` requirements, but the rustdoc omits those conditions.

## Do not flag
- Private items.
- Infallible functions with no visible panic path.
- Trivial refactors that leave public behavior unchanged.
- Crate-internal `unsafe` helpers that are not part of the public contract.

## Confidence guidance
- `HIGH`: the code visibly returns `Result`, can panic, or is `unsafe`, and the
  docs lack the matching section.
- `MEDIUM`: behavior is inferred from helper calls.
- `LOW`: the item may be internal-only or separately documented elsewhere.

## Remediation
- Add rustdoc describing the API's error cases, panic conditions, and safety
  requirements.

## Pass example
```rust
/// Parses a port number.
///
/// # Errors
/// Returns `ParsePortError` if the string is not a valid `u16`.
///
/// # Panics
/// Panics if the parser table is not initialized.
pub fn parse_port(input: &str) -> Result<u16, ParsePortError> {
    input.parse().map_err(|_| ParsePortError)
}
```

## Fail example
```rust
pub fn parse_port(input: &str) -> Result<u16, ParsePortError> {
    input.parse().map_err(|_| ParsePortError)
}
```
