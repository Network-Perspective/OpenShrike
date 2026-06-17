---
id: rel-015
title: Lease-based coordination uses fencing or epoch validation
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
---

# rel-015: Lease-based coordination uses fencing or epoch validation

## Intent
Prevent expired leaders or lock holders from continuing to mutate shared state.

## Applicability
Applies when the diff adds lease-based leadership, locks, or exclusive writer coordination.

## What to inspect
Lease tokens, epochs, fencing IDs, and whether shared resources validate them.

## Pass criteria
Mutating operations carry and validate a monotonically increasing fencing token or equivalent epoch.

## Fail criteria
The diff relies on lease ownership alone with no downstream fencing or epoch validation.

## Do not flag
Pure advisory locks with no correctness-critical mutation.

## Confidence guidance
`HIGH` when a leased mutator has no fencing token. `MEDIUM` when validation may happen in a lower layer. `LOW` when the coordination boundary is partial.

## Remediation
Add fencing tokens or epoch checks at the resource being mutated.

## Pass example
```sql
UPDATE jobs SET owner_epoch = ? WHERE id = ? AND owner_epoch < ?;
```

## Fail example
```sql
UPDATE jobs SET status = 'running' WHERE id = ?;
```
