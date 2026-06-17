---
id: data-011
title: Durable-state mutations are atomic, rollback-safe, and concurrency-correct
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Evolutionary Architectures
    chapter: 'Chapter 6 "Two-Phase Commit Transactions"'
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
---

# data-011: Durable-state mutations are atomic, rollback-safe, and concurrency-correct

## Intent
Prevent lost updates, torn state, and partial durability when multiple writes or failures interact.

## Applicability
Applies to transactional business writes, file-backed durable state, caches coupled to source-of-truth writes, and concurrent mutations. Return `unknown` when mutation coordination is outside scope.

## What to inspect
Transactions, locking, compare-and-set logic, rollback rules, file rewrite patterns, and dual-write code paths.

## Pass criteria
State changes are atomic at their durability boundary, failure paths roll back correctly, concurrency-sensitive invariants are protected, and derived systems are updated through safe coordination rather than ad hoc dual writes.

## Fail criteria
Read-modify-write updates race without coordination, checked failures commit partial changes, writes rely on last-write-wins for critical state, or one operation independently writes both source and derived systems.

## Do not flag
Intentionally loss-tolerant caches or idempotent recomputation paths where stale overwrites are acceptable.

## Confidence guidance
`HIGH` when concurrency hazards or partial-write patterns are explicit. `MEDIUM` when isolation may exist outside the diff. `LOW` when storage guarantees are abstracted away.

## Remediation
Make the smallest change at the current durability boundary that removes the race or partial-commit risk: add a transaction, constraint, atomic replacement, lock, compare-and-set, or the repo's existing reliable propagation pattern.

## Pass example
```sql
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
```

## Fail example
```python
row = db.get_account(id)
row.balance += 100
db.save(row)
```
