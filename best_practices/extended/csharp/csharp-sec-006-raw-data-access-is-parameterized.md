---
id: csharp-sec-006
title: Raw data access is parameterized
domain: sec
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-sec-006: Raw data access is parameterized

## Intent
SQL and database command construction are injection boundaries. Raw queries must keep data separate from code.

## Applicability
Applies when the code builds raw SQL, command text, stored procedure calls, or ORM raw-query APIs. Return `unknown` when the final command generation is outside scope.

## What to inspect
`CommandText`, `SqlCommand`, Dapper query strings, `FromSqlRaw`, `ExecuteSqlRaw`, and interpolated SQL.

## Pass criteria
Values are passed as parameters or ORM-safe interpolated forms that parameterize safely, and dynamic identifiers are chosen from allowlists.

## Fail criteria
Query text is built with string concatenation or interpolation from untrusted values, or raw SQL APIs are used with externally influenced values and no parameter binding.

## Do not flag
Constant SQL text. Migrations or maintenance scripts with no untrusted input. Safe ORM APIs that parameterize interpolated values.

## Confidence guidance
`HIGH` when direct string-built SQL is visible. `MEDIUM` when trust level is inferred. `LOW` when the query source is out of scope.

## Remediation
Use parameters or ORM-safe interpolated APIs, and allowlist dynamic identifiers.

## Pass example
```csharp
await connection.QueryAsync<User>("select * from users where email = @Email", new { Email = request.Email });
```

## Fail example
```csharp
var sql = $"select * from users where email = '{request.Email}'";
```
