---
id: sec-003
title: SQL remains parameterized and structural query fragments are allowlisted
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: book
    title: Alice and Bob Learn Application Security
    author: Tanya Janca
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: book
    title: SQL Antipatterns
    author: Bill Karwin
  - type: standard
    title: Bandit rule documentation + Semgrep Python security rules
  - type: standard
    title: Brakeman warning documentation
  - type: article
    title: goldbergyoni/nodebestpractices (GitHub repo)
  - type: article
    title: PHP The Right Way
  - type: standard
    title: PHPStan / Psalm rule documentation
  - type: standard
    title: Rails Security Guide
  - type: article
    title: "Survive The Deep End: PHP Security"
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
---

# sec-003: SQL remains parameterized and structural query fragments are allowlisted

## Intent
Keep untrusted data out of query structure so values remain data and structural fragments stay under explicit developer control.

## Applicability
Applies when the diff adds or changes raw SQL, native queries, stored procedure calls, or query fragments such as `ORDER BY` or selected columns. Return `unknown` when final query rendering is hidden behind abstractions.

## What to inspect
SQL strings, ORM raw-query APIs, string interpolation, placeholders, parameter bags, and dynamic identifier mapping.

## Pass criteria
Values are bound separately from query text, and any dynamic identifiers or sort directions are mapped from a closed allowlist.

## Fail criteria
External values are concatenated or interpolated into SQL text, or user input directly selects structural fragments without an explicit allowlist.

## Do not flag
Constant migration SQL. ORM query builders that parameterize safely. Closed enum-to-identifier mappings visible in the repository.

## Confidence guidance
`HIGH` when direct interpolation is visible. `MEDIUM` when dynamic composition exists but trust level is inferred. `LOW` when final query generation is hidden.

## Remediation
Use parameter binding for values and fixed allowlists for structural query choices.

## Pass example
```python
cursor.execute("SELECT * FROM users WHERE email = %s", [email])
```

## Fail example
```python
cursor.execute(f"SELECT * FROM users WHERE email = '{email}' ORDER BY {sort}")
```
