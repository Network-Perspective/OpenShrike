---
id: rel-006
title: Retried or redelivered work is idempotent or deduplicated
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: API Design Patterns
  - type: book
    title: Building Microservices
  - type: standard
    title: Laravel official docs security, validation, authentication, authorization, and queue sections
  - type: standard
    title: Microsoft REST API Guidelines and Zalando RESTful API Guidelines
  - type: standard
    title: Sidekiq Best Practices Wiki
---

# rel-006: Retried or redelivered work is idempotent or deduplicated

## Intent
Prevent duplicate charges, duplicate jobs, repeated mutations, and overlapping work when retries or queue redelivery happen.

## Applicability
Applies to non-idempotent API operations, jobs, queue consumers, and retried distributed work.

## What to inspect
Idempotency keys, deduplication stores, transactional guards, overlap locks, and side-effect boundaries.

## Pass criteria
The operation is intrinsically idempotent or the diff adds visible deduplication or overlap prevention.

## Fail criteria
The diff introduces retried or redelivered side effects with no deduplication, transactional guard, or overlap control.

## Do not flag
Pure reads and deterministic recomputation with no external side effects.

## Confidence guidance
`HIGH` when duplicate side effects are directly visible. `MEDIUM` when deduplication may exist in shared infrastructure. `LOW` when operation ownership is incomplete.

## Remediation
Add idempotency keys, dedupe state, resource-level overlap guards, or transactional fences around side effects.

## Pass example
```sql
INSERT INTO payments(idempotency_key, charge_id) VALUES (?, ?)
```

## Fail example
```ruby
perform_charge(order_id)
```
