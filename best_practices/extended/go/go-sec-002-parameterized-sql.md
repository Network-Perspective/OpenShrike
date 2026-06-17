---
id: go-sec-002
title: SQL remains parameterized
domain: sec
language: go
app-type: [any]
status: active
sources: []
---

# go-sec-002: SQL remains parameterized

## Intent
Raw SQL construction is an injection boundary. Go code should keep query text and values separate whether it uses `database/sql`, sqlx, GORM raw SQL, pgx, or other drivers.

## Applicability
Applies when the diff introduces or changes raw SQL or query fragments. Return `unknown` when the final query rendering is hidden behind helpers.

## What to inspect
SQL strings, driver calls, `fmt.Sprintf`, concatenation, and externally influenced fragments in query text.

## Pass criteria
Values are passed through placeholders and args, and dynamic identifiers are chosen from allowlists.

## Fail criteria
Externally influenced values are interpolated into SQL strings, or raw query helpers accept concatenated where or order fragments from input.

## Do not flag
Constant migration SQL. ORM-generated parameterized queries.

## Confidence guidance
`HIGH` when direct interpolation is visible. `MEDIUM` when trust level is inferred. `LOW` when generation is hidden.

## Remediation
Use placeholders and args, and allowlist dynamic identifiers.

## Pass example
```go
db.QueryContext(ctx, "select * from users where email = $1", email)
```

## Fail example
```go
db.QueryContext(ctx, fmt.Sprintf("select * from users where email = '%s'", email))
```
