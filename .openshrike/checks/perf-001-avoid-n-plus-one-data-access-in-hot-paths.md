---
id: perf-001
title: Avoid N+1 data access in hot paths
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Performance Excuses Debunked
    author: Casey Muratori
  - type: article
    title: EF Core Performance Docs
    author: Vlad Mihalcea
---

# perf-001: Avoid N+1 data access in hot paths

## Intent
Prevent latency and infrastructure regressions caused by doing one database or remote lookup per item in a result set.

## Applicability
Applies when the diff adds or changes code that iterates over many records and performs database, cache, filesystem, or network lookups for each item in a request path, render path, or large batch path. Return `unknown` if the changed code handles only a single entity, if the iteration is clearly over a tiny fixed set, or if no data-access call exists inside the loop.

## What to inspect
Loops over query results or collections, ORM lazy-loading, repository calls inside loops, outbound HTTP calls inside loops, and nearby controller, handler, or job code that shows whether the path is latency-sensitive or processes many items.

## Pass criteria
Direct evidence shows the code batches related lookups, eager-loads needed associations, precomputes a lookup map, or otherwise avoids one remote or database call per iterated item.

## Fail criteria
The diff adds or keeps a pattern where code iterates over a collection and performs a database query or other remote call inside that loop for each item, with no repository evidence that the loop is intentionally bounded to a tiny constant size.

## Do not flag
Do not flag test code, migrations, one-off maintenance scripts, loops over visibly tiny constant collections, or code where the lookup is already satisfied from an in-memory map prepared before the loop.

## Confidence guidance
`HIGH` when the loop and per-item database or remote call are directly visible in a request or batch path. `MEDIUM` when the call is hidden behind helpers but the per-item access pattern is still strongly implied. `LOW` when the path's scale or latency sensitivity is unclear from repository evidence.

## Remediation
Batch the lookup once before iterating, or eager-load or project the related data needed by the loop.

## Pass example
```python
user_ids = [row.user_id for row in orders]
users_by_id = {
    user.id: user
    for user in db.users.find_many({"id": {"$in": user_ids}})
}

return [format_order(order, users_by_id[order.user_id]) for order in orders]
```

## Fail example
```python
result = []
for order in orders:
    user = db.users.find_one({"id": order.user_id})
    result.append(format_order(order, user))
```
