# CSHARP-SEC-006: Raw data access is parameterized

## Intent

SQL and database command construction are injection boundaries. Raw queries
must keep data separate from code.

## Applicability

Applies when the code builds raw SQL, command text, stored procedure calls, or
ORM raw-query APIs.

Return `unknown` when the query builder abstraction exists but the final command
generation is outside scope.

## Strategy

`static`

## What to inspect

1. Search for `CommandText`, `SqlCommand`, Dapper query strings,
   `FromSqlRaw`, `ExecuteSqlRaw`, and interpolated SQL.
2. Check whether user input reaches the SQL text or parameter bag.

## Pass criteria

- Values are passed as parameters, placeholders, or ORM-supported interpolated
  forms that parameterize safely.
- Dynamic identifiers such as sort columns are chosen from an allowlist.

## Fail criteria

- Query text is built with string concatenation or interpolation from untrusted
  values.
- Raw SQL APIs are used with externally influenced values and no parameter
  binding.

## Do not flag

- Constant SQL text.
- Migrations or maintenance scripts with no untrusted input.
- Safe ORM APIs that parameterize interpolated values.

## Evidence to collect

- The raw SQL text.
- The untrusted value reaching it.

## Confidence guidance

- `HIGH`: direct string-built SQL with external input is visible.
- `MEDIUM`: dynamic SQL exists, but input trust level is partly inferred.
- `LOW`: prefer `unknown` if the query source is out of scope.

## Remediation

- Use parameters or ORM-safe interpolated APIs.
- Allowlist dynamic identifiers instead of concatenating them.

## Pass example

```csharp
await connection.QueryAsync<User>(
    "select * from users where email = @Email",
    new { Email = request.Email });
```

## Fail example

```csharp
var sql = $"select * from users where email = '{request.Email}'";
await connection.QueryAsync<User>(sql);
```
