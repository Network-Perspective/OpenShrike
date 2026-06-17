---
id: rel-017
title: Side effects and downstream jobs run only after durable commit
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Get Your Hands Dirty on Clean Architecture
  - type: documentation
    title: "Laravel official docs: security, validation, authentication, authorization, and queue sections"
---

# rel-017: Side effects and downstream jobs run only after durable commit

## Intent
Prevent jobs and external side effects from observing or acting on state that later rolls back.

## Applicability
Applies when the diff adds queued work, messages, emails, or remote calls around a database transaction.

## What to inspect
Transaction boundaries, side-effect timing, after-commit hooks, and enqueue or publish calls.

## Pass criteria
External side effects and dependent jobs are emitted after the durable commit point or through an outbox or equivalent commit-coupled mechanism.

## Fail criteria
The diff dispatches jobs or side effects before the enclosing transaction is durable.

## Do not flag
Read-only transaction scopes. Purely local in-memory callbacks.

## Confidence guidance
`HIGH` when enqueue-before-commit is directly visible. `MEDIUM` when transaction ownership is partly hidden. `LOW` when durability boundaries are unclear.

## Remediation
Move dispatch or publish logic to an after-commit hook, outbox, or use-case boundary that runs after durability is guaranteed.

## Pass example
```csharp
await db.SaveChangesAsync(ct);
await outbox.PublishAsync(evt, ct);
```

## Fail example
```csharp
await bus.PublishAsync(evt, ct);
await db.SaveChangesAsync(ct);
```
