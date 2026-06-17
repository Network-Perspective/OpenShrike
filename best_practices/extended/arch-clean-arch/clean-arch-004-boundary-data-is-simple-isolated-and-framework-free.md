---
id: clean-arch-004
title: Boundary data is simple, isolated, and framework-free
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
    author: Tom Hombergs
    chapter: 'Ch. 5 "Different input models for different use cases"; Ch. 11 "Sharing models between use cases"'
---

# clean-arch-004: Boundary data is simple, isolated, and framework-free

## Intent
Data crossing an architectural boundary should be shaped for the inner side of that boundary, not drag framework, transport, or storage types inward.

## Applicability
Applies when the diff changes request/response models, signatures, presenter models, gateway results, or other cross-boundary data.

## What to inspect
Changed parameter and return types, DTOs, request models, and mapper boundaries.

## Pass criteria
Boundary methods use simple DTOs, commands, queries, or records that are free of outer-layer framework dependencies.

## Fail criteria
The diff passes `HttpRequest`, ORM entities, generated transport models, or similar outer types into an inner layer.

## Do not flag
Outer-layer types that stay at the edge and are immediately mapped.

## Confidence guidance
`HIGH` when the signature directly exposes an outer type. `MEDIUM` when the crossing is inferred from layout. `LOW` when the boundary itself is unclear.

## Remediation
Introduce inward-facing boundary models and map at the adapter edge.

## Pass example
```java
record CreateOrderCommand(String customerId, List<String> items) {}
```

## Fail example
```java
CreateOrderResponse handle(HttpServletRequest request)
```
