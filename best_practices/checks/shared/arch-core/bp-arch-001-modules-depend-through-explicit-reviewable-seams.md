---
id: bp-arch-001
title: Modules depend through explicit, reviewable seams
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Fundamentals of Software Architecture
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
    author: Tom Hombergs
  - type: article
    title: Google Engineering Practices - Code Review Developer Guide
---

# bp-arch-001: Modules depend through explicit, reviewable seams

## Intent
Keep module, package, project, and component boundaries explicit so features do not reach into another unit's private internals.

## Applicability
Applies when the diff changes cross-module imports, project references, shared packages, or module-to-module collaboration.

## What to inspect
Changed dependency edges, shared modules, internal package paths, private helpers, and public seam ownership.

## Pass criteria
Cross-module use goes through a published API, contract, mediator, or other explicit seam.

## Fail criteria
The diff reaches into another module's internals, creates a hidden backdoor dependency, or grows a generic shared area that carries private coupling.

## Do not flag
Published public APIs, test-only dependencies, and tiny repos with no meaningful module boundary.

## Confidence guidance
`HIGH` when the illegal edge is directly visible. `MEDIUM` when the boundary is inferred from layout or metadata. `LOW` when ownership is unclear.

## Remediation
Route the dependency through an existing published seam, or move the code so it no longer crosses the boundary; introduce a new seam only when the boundary is already real and the direct dependency cannot be removed locally.

## Pass example
```java
package orders.api;

public interface PricingPort {
    Quote quote(OrderDraft draft);
}
```

## Fail example
```java
package orders;

import pricing.internal.SqlBackfillHelper;
```
