---
id: clean-arch-003
title: Boundary ports are owned by the inner policy layer
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: Effective Go + Go Code Review Comments
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
    author: Tom Hombergs
  - type: article
    title: Hexagonal Architecture
    author: Alistair Cockburn
  - type: book
    title: Modern Software Engineering
---

# clean-arch-003: Boundary ports are owned by the inner policy layer

## Intent
Core policy should define the contracts it needs, and outer adapters should implement them.

## Applicability
Applies when the diff adds or materially changes interfaces, abstract classes, protocols, or callback contracts that cross an architectural boundary.

## What to inspect
Where the contract is declared, who imports it, and whether the naming and placement reflect policy needs or adapter details.

## Pass criteria
The inner layer owns the port and outer implementations depend inward on it.

## Fail criteria
Infrastructure or framework code declares the contract and forces the core to depend outward on adapter-owned abstractions.

## Do not flag
Truly low-level shared abstractions that are not policy/detail seams.

## Confidence guidance
`HIGH` when the core imports an adapter-owned interface. `MEDIUM` when ownership is inferred from layout. `LOW` when the abstraction may not be a real boundary port.

## Remediation
Move the port inward, name it in policy terms, and reuse an existing inward seam when one already covers the boundary.

## Pass example
```go
type UserLoader interface { Load(ctx context.Context, id string) (User, error) }
```

## Fail example
```go
type SqlUserRepository interface { SelectUser(ctx context.Context, id string) (Row, error) }
```
