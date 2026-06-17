---
id: api-020
title: Public APIs do not expose mutable internal representation or caller-owned mutable state unsafely
domain: api
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Java
    author: Joshua Bloch
    year: 2008
  - type: book
    title: Fluent Python
---

# api-020: Public APIs do not expose mutable internal representation or caller-owned mutable state unsafely

## Intent
Public APIs should preserve invariants and ownership boundaries instead of letting callers mutate internal state accidentally through shared aliases.

## Applicability
Applies when the diff changes public DTOs, classes, structs, constructors, getters, or other public boundaries that store or return mutable values.

## What to inspect
Public mutable fields, returned arrays or collections, constructor or setter storage of caller-owned mutable inputs, and whether the implementation defensively copies before retaining or exposing state.

## Pass criteria
The boundary keeps mutable representation private, returns defensive copies or read-only views where appropriate, and copies caller-owned mutable inputs before later mutation or retention would alias shared state.

## Fail criteria
A public API exposes mutable internal fields directly, returns internal arrays or collections by reference, or stores a caller-owned mutable input and later mutates it through the same shared object.

## Do not flag
Transparent data carriers whose mutability is itself the explicit contract, or intentionally shared live views that are clearly documented and named as such.

## Confidence guidance
`HIGH` when the public field, returned array, or shared mutable alias is directly visible. `MEDIUM` when wrapper helpers may hide copying behavior. `LOW` when ownership is unclear.

## Remediation
Keep mutable representation private, copy mutable inputs before retaining them, and return defensive copies or read-only views from public boundaries.

## Pass example
```java
this.tags = List.copyOf(tags);
return List.copyOf(tags);
```

## Fail example
```java
public String[] tags;
public String[] getTags() { return tags; }
```
