---
id: csharp-api-002
title: HTTP APIs return consistent machine-readable errors
domain: api
language: csharp
app-type: [http-service]
status: active
sources: []
---

# csharp-api-002: HTTP APIs return consistent machine-readable errors

## Intent
ASP.NET HTTP APIs should expose a consistent, machine-readable failure contract instead of ad hoc bodies.

## Applicability
Applies to public or cross-team HTTP APIs in .NET. Return `unknown` for internal-only endpoints where the error contract is not visible.

## What to inspect
Changed endpoint error paths, exception filters, `ProblemDetails` usage, validation errors, and whether domain errors fit the same contract family.

## Pass criteria
Failures use `ProblemDetails`, `ValidationProblemDetails`, or an equivalent documented contract consistently across validation, not-found, conflict, and domain error paths.

## Fail criteria
Endpoints return raw exception strings, arbitrary anonymous JSON, plain text, or a mix of incompatible failure shapes without a clear contract reason.

## Do not flag
Internal tooling endpoints with no external contract, or browser HTML flows where HTTP API conventions do not apply.

## Confidence guidance
`HIGH` when the endpoint directly returns ad hoc error bodies. `MEDIUM` when a central filter may exist but is not visible. `LOW` when endpoint contract scope is unclear.

## Remediation
Standardize on `ProblemDetails` or an equivalent documented error envelope and keep machine-readable codes in typed fields or extensions.

## Pass example
```csharp
return Results.Problem(title: "Order cannot be cancelled", statusCode: 409);
```

## Fail example
```csharp
return Results.Json(new { error = ex.Message }, statusCode: 409);
```
