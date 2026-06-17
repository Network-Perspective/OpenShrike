---
id: arch-005
title: Module-owned mutable state and representations stay encapsulated
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: A Philosophy of Software Design
    author: John Ousterhout
  - type: standard
    title: C++ Core Guidelines
  - type: book
    title: Effective Kotlin
  - type: book
    title: Refactoring
    author: Martin Fowler
  - type: book
    title: "Unit Testing: Principles, Practices, and Patterns"
    author: Vladimir Khorikov
---

# arch-005: Module-owned mutable state and representations stay encapsulated

## Intent
Do not expose module-owned mutable state directly or turn internal state layout into a public contract.

## Applicability
Applies when the diff changes exported/shared APIs, getters, mutable globals, or storage of shared state.

## What to inspect
Returned collections, mutable globals, singleton state containers, direct field exposure, and APIs widened only to let tests or callers manipulate internals.

## Pass criteria
Shared APIs expose focused accessors, immutable snapshots, or read-only views, and mutable state remains owned by one module.

## Fail criteria
The diff returns internal mutable state directly, adds mutable ambient global state, or widens a production API so callers can manipulate internals.

## Do not flag
Immutable value objects and intentionally public compatibility APIs that are already part of the supported contract.

## Confidence guidance
`HIGH` when the API visibly returns internal mutable storage or adds a mutable global. `MEDIUM` when mutability is indirect. `LOW` when ownership is unclear.

## Remediation
Hide the representation behind focused accessors and keep state privately owned.

## Pass example
```java
String getParameter(String name) { return params.get(name); }
```

## Fail example
```java
Map<String, String> getParams() { return params; }
```
