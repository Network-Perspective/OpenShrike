---
id: sec-rust-001
title: Unsafe Rust keeps explicit soundness contracts and avoids unsound primitives
domain: sec
language: rust
app-type:
  - any
status: active
sources:
  - type: standard
    title: Clippy lint documentation
  - type: book
    title: The Rust Programming Language
    chapter: '20 "Unsafe Rust"'
  - type: book
    title: The Rustonomicon
---

# sec-rust-001: Unsafe Rust keeps explicit soundness contracts and avoids unsound primitives

## Intent
Keep unsafe Rust reviewable by making invariants explicit and by avoiding unsound APIs and memory tricks that violate aliasing or initialization guarantees.

## Applicability
Applies when the diff adds or changes `unsafe` blocks, raw pointer dereferences, manual `Send` or `Sync` impls, `Vec::set_len`, `transmute`, or advanced drop or lifetime escape hatches. Return `unknown` when unsafe internals are hidden in macros or generated code.

## What to inspect
`unsafe` blocks, `// SAFETY:` comments, public APIs that dereference raw pointers, manual `Send` or `Sync`, `set_len`, `transmute`, and advanced destructor attributes.

## Pass criteria
Unsafe code carries nearby soundness rationale, public APIs that require caller-held invariants are marked `unsafe`, and memory-manipulation primitives preserve initialization and aliasing invariants.

## Fail criteria
Unsafe code lacks local invariants, safe public APIs dereference raw pointers, or the code uses unsound primitives such as `set_len` before initialization or `transmute` from `&T` to `&mut T`.

## Do not flag
Generated code. Unchanged legacy unsafe outside the reviewed diff. Patterns using `MaybeUninit` or spare capacity correctly.

## Confidence guidance
`HIGH` when an unsafe invariant violation or unsound primitive is directly visible. `MEDIUM` when a comment or helper likely hides part of the invariant. `LOW` when macro expansion hides the actual unsafe path.

## Remediation
Add explicit `// SAFETY:` reasoning, narrow unsafe scope, mark caller-contract APIs `unsafe`, and use sound initialization patterns.

## Pass example
```rust
// SAFETY: ptr is guaranteed non-null and points to initialized memory for one byte.
unsafe { *ptr }
```

## Fail example
```rust
let mut buf = Vec::with_capacity(n);
unsafe { buf.set_len(n) }
reader.read_exact(&mut buf)?;
```
