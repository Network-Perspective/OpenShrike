---
id: bp-arch-002
title: Dependency direction follows the architecture instead of bypassing it
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Evolutionary Architectures
  - type: book
    title: "Clean Architecture: A Craftsman's Guide to Software Structure and Design"
    author: Robert C. Martin
  - type: book
    title: Domain-Driven Design
    author: Eric Evans
  - type: book
    title: Fundamentals of Software Architecture
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
    author: Tom Hombergs
---

# bp-arch-002: Dependency direction follows the architecture instead of bypassing it

## Intent
High-level policy and domain logic should not depend directly on transport, persistence, UI, or framework details.

## Applicability
Applies when the repo shows meaningful layers, modules, or inner-versus-outer boundaries and the diff changes dependencies across them.

## What to inspect
Imports, inheritance, annotations, project references, and direct calls crossing policy/detail boundaries.

## Pass criteria
Dependency direction matches the apparent architecture and adapters depend inward on policy.

## Fail criteria
Domain or application code directly depends on a lower-level implementation detail or skips an intended boundary.

## Do not flag
Composition-root code, thin adapters, and small repos where explicit layering would be artificial.

## Confidence guidance
`HIGH` when the reverse dependency is direct. `MEDIUM` when layering is inferred from names and layout. `LOW` when architecture intent is ambiguous.

## Remediation
Move detail-specific code back to the edge, or depend on an existing inward-facing seam; add a new interface only when a real boundary already exists and no smaller local move removes the outward dependency.

## Pass example
```python
class CreateInvoice:
    def __init__(self, payments: PaymentsPort) -> None:
        self.payments = payments
```

## Fail example
```python
from flask import Request
from sqlalchemy.orm import Session

class CreateInvoice:
    def handle(self, req: Request, db: Session) -> None:
        ...
```
