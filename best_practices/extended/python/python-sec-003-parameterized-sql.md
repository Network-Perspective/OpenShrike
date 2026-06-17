---
id: python-sec-003
title: Raw SQL remains parameterized
domain: sec
language: python
app-type: [any]
status: active
sources: []
---

# python-sec-003: Raw SQL remains parameterized

## Intent
SQL construction is an injection boundary. Python code should keep query text and values separate whether it uses DB-API, SQLAlchemy, async drivers, or micro-ORMs.

## Applicability
Applies when the diff builds raw SQL, text queries, or driver-level statements. Return `unknown` when final SQL generation is hidden behind a wrapper.

## What to inspect
Raw SQL, query-building code, f-strings, `%` formatting, and concatenation with externally influenced values.

## Pass criteria
Query values are passed separately through parameters or placeholders, and dynamic identifiers are chosen from allowlists.

## Fail criteria
Externally influenced values are interpolated into SQL text, or raw query APIs are used with concatenated where or order fragments.

## Do not flag
Constant maintenance SQL with no external input. ORM query builders that parameterize safely.

## Confidence guidance
`HIGH` when direct interpolation is visible. `MEDIUM` when trust level is inferred. `LOW` when rendering is not visible.

## Remediation
Use driver or ORM parameter binding, and allowlist dynamic identifiers.

## Pass example
```python
cursor.execute("select * from users where email = %s", [email])
```

## Fail example
```python
cursor.execute(f"select * from users where email = '{email}'")
```
