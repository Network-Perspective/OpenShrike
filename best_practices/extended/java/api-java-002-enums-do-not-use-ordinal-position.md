---
id: api-java-002
title: Java enums do not use ordinal position for persisted or external semantics
domain: api
language: java
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Java
    author: Joshua Bloch
    year: 2008
  - type: documentation
    title: Error Prone Bug Patterns documentation
---

# api-java-002: Java enums do not use ordinal position for persisted or external semantics

## Intent
Enum declaration order is unstable and should not define persistence, wire, or indexing semantics.

## Applicability
Applies when the diff changes public or persisted Java enum use, serialization, deserialization, or enum-keyed collections.

## What to inspect
Calls to `ordinal()`, `values()[index]`, persisted enum storage, deserialization helpers, and array indexing keyed by enum position.

## Pass criteria
External or persisted enum meaning uses an explicit stable field or enum-aware collections such as `EnumMap` or `EnumSet`, not ordinal position.

## Fail criteria
The diff persists ordinals, deserializes by ordinal index, or uses ordinal-indexed arrays as a public or persisted contract.

## Do not flag
Pure in-memory iteration order logic with no external or persisted meaning.

## Confidence guidance
`HIGH` when `ordinal()` or ordinal-indexed lookups are directly visible. `MEDIUM` when persistence behavior is inferred from surrounding code. `LOW` when the enum never leaves one internal module.

## Remediation
Use explicit stable values and enum-aware collections instead of ordinal position for persisted or public semantics.

## Pass example
```java
enum Status { NEW("N"), SENT("S"); }
```

## Fail example
```java
int stored = status.ordinal();
```
