---
id: data-020
title: Database handles are pooled or deterministically released
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Production-Ready Microservices
    author: Susan Fowler
    chapter: Chapter 4 "Watch Out for Database Connections"
---

# data-020: Database handles are pooled or deterministically released

## Intent
Prevent connection leaks from exhausting shared database capacity.

## Applicability
Applies to database clients, sessions, transactions, and connection-opening code. Return `unknown` when connection lifecycle is fully framework-managed.

## What to inspect
Connection acquisition, pooling config, `close` or disposal paths, transaction cleanup, and early returns.

## Pass criteria
Database handles come from a pool or are deterministically closed on all paths.

## Fail criteria
Code opens handles per use without pooling and without reliable release on success and failure paths.

## Do not flag
Framework-managed pools or request-scoped sessions where lifecycle ownership is clearly visible.

## Confidence guidance
`HIGH` when handles are opened without cleanup. `MEDIUM` when cleanup may happen in hidden framework code. `LOW` when only configuration changed.

## Remediation
Use pooled clients and ensure all borrowed handles are released deterministically.

## Pass example
```python
with engine.begin() as conn:
    conn.execute(stmt)
```

## Fail example
```python
conn = psycopg.connect(dsn)
conn.execute(stmt)
```
