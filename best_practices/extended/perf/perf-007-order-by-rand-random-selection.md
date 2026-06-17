---
id: perf-007
title: Do not randomize large result sets with ORDER BY RAND()
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: SQL Antipatterns
    author: Bill Karwin
    chapter: "Chapter 16: Random Selection"
---

# perf-007: Do not randomize large result sets with ORDER BY RAND()

## Intent
Sorting an entire table by a random function scales poorly and wastes work just to discard nearly all rows.

## Applicability
Applies when the diff adds or changes SQL that selects a random row or sample from a database-backed collection. Return `unknown` if the repository evidence shows the dataset is permanently tiny and bounded.

## What to inspect
Queries using `ORDER BY RAND()`, `ORDER BY RANDOM()`, or equivalent per-row random sort functions, especially with `LIMIT 1`.

## Pass criteria
The code uses a strategy that avoids full random sorting, such as random offset, random key selection with known constraints, or a database-native sampling feature.

## Fail criteria
The diff picks random rows by sorting the candidate set on a random expression.

## Do not flag
Do not flag clearly bounded lookup tables or tiny static datasets where scalability is irrelevant. Do not flag vendor sampling features designed for this purpose.

## Confidence guidance
`HIGH` when the changed query literally contains `ORDER BY RAND()` or `ORDER BY RANDOM()`. `MEDIUM` when randomness is hidden behind an ORM helper that expands to random sort. `LOW` when repository context is too small to know whether the table is nontrivial.

## Remediation
Replace random sorting with a sampling strategy that does not require sorting the full result set.

## Pass example
```sql
SELECT *
FROM bugs
LIMIT 1 OFFSET :random_offset;
```

## Fail example
```sql
SELECT *
FROM bugs
ORDER BY RAND()
LIMIT 1;
```
