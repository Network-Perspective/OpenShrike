---
id: clean-arch-002
title: Application business rules live in explicit use cases
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: A Philosophy of Software Design
    author: John Ousterhout
  - type: article
    title: Vertical Slice Architecture isn't technical
    author: Derek Comartin
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
    author: Tom Hombergs
  - type: article
    title: Hexagonal Architecture
    author: Alistair Cockburn
  - type: book
    title: Sustainable Web Development with Ruby on Rails
---

# clean-arch-002: Application business rules live in explicit use cases

## Intent
Workflow rules belong in an owning use case, interactor, or application-service boundary, not in controllers, repositories, views, or framework hooks.

## Applicability
Applies when the diff changes business behavior in a repo with visible use cases, handlers, or equivalent workflow boundaries.

## What to inspect
Changed handlers, controllers, services, repositories, callbacks, and where business sequencing or decisions now live.

## Pass criteria
Business workflow remains concentrated in an explicit use-case boundary and outer adapters stay thin.

## Fail criteria
The diff spreads substantial business workflow across controllers, mailers, repositories, views, or other outer adapters.

## Do not flag
Thin routing, parsing, authorization, formatting, and persistence-only code.

## Confidence guidance
`HIGH` when the outer adapter clearly owns business sequencing. `MEDIUM` when ownership is inferred from names and surrounding code. `LOW` when no stable use-case layer is visible.

## Remediation
Move the changed workflow into an existing use case, or extract the smallest owning use case needed for this behavior, and keep outer layers focused on translation and I/O.

## Pass example
```java
final class TransferFunds {
    void handle(Command cmd) { account.debit(cmd.amount()); }
}
```

## Fail example
```java
@RestController
final class TransferController {
    void post(Request req) { if (balance < req.amount()) throw ...; repo.save(...); }
}
```
