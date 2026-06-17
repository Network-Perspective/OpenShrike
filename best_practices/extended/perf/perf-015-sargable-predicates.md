---
id: perf-015
title: Keep searched columns free of functions and expressions in predicates
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Use The Index, Luke
---

# perf-015: Keep searched columns free of functions and expressions in predicates

## Intent
Functions, arithmetic, and other expressions on searched columns can disable normal index usage and turn targeted lookups into scans.

## Applicability
Applies when the diff adds or changes SQL or ORM predicates over persisted relational data in `WHERE` or join conditions. Return `unknown` if the diff contains no relational predicates or the storage layer is not visible enough to judge index usage.

## What to inspect
Changed SQL predicates, ORM filter expressions, join conditions, and any related schema changes such as expression indexes, normalized columns, or case-insensitive collations.

## Pass criteria
The predicate compares the raw searched column to a parameter, literal, or range bound, or the repository shows an intentional matching expression index or normalized search column for that predicate.

## Fail criteria
The diff wraps a searched column in a function, cast, arithmetic expression, concatenation, or similar transformation that obscures the indexable value being searched.

## Do not flag
Do not flag predicates backed by an explicit matching expression or function-based index added or already present in the repository. Do not flag databases or columns that are explicitly configured for case-insensitive comparison so that no column-side function is needed. Do not flag test fixtures or throwaway maintenance scripts that are clearly not production query paths.

## Confidence guidance
`HIGH` when the changed predicate directly applies a function or expression to the searched column and no compensating index is visible. `MEDIUM` when the query shape is clear, but the presence of an existing expression index is only partially visible. `LOW` when the predicate is visible, but repository evidence about the underlying schema is weak.

## Remediation
Move the transformation to the parameter side or add a normalized column or matching expression index for the intended search.

## Pass example
```sql
SELECT id
FROM users
WHERE created_at >= :cutoff;
```

## Fail example
```sql
SELECT id
FROM users
WHERE DATE(created_at) = :day;
```
