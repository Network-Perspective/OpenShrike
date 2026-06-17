---
id: data-kotlin-017
title: Keep custom equality and hash codes contract-safe
domain: data
language: kotlin
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Kotlin
    author: Marcin Moskala
---

# data-kotlin-017: Keep custom equality and hash codes contract-safe

## Intent
Prevent collections and comparisons from breaking because equality and hashing disagree.

## Applicability
Applies to Kotlin classes with custom `equals` or `hashCode`. Return `unknown` when only generated data-class behavior is used.

## What to inspect
Custom `equals`, `hashCode`, mutable identity fields, and symmetry or null handling.

## Pass criteria
`equals` is reflexive, symmetric, transitive, and consistent, and `hashCode` matches the same identity fields.

## Fail criteria
Equality or hashing uses different fields, breaks symmetry across subclasses, or depends on mutable state in unsafe ways.

## Do not flag
Plain data classes using compiler-generated `equals` and `hashCode` unchanged.

## Confidence guidance
`HIGH` when custom methods clearly violate the contract. `MEDIUM` when hidden superclass behavior matters. `LOW` when only one method is visible.

## Remediation
Define equality and hashing from the same stable identity and prefer data classes when appropriate.

## Pass example
```kotlin
override fun equals(other: Any?) = other is User && id == other.id
override fun hashCode() = id.hashCode()
```

## Fail example
```kotlin
override fun equals(other: Any?) = other is User && email == other.email
override fun hashCode() = id.hashCode()
```
