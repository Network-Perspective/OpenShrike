# CSHARP-API-002: HTTP APIs return consistent machine-readable errors

## Intent

Clients should be able to reason about failures without scraping ad hoc error
strings. Consistent machine-readable errors make integrations safer and easier
to evolve.

## Applicability

Applies to public or cross-team HTTP APIs.

Return `unknown` for internal-only endpoints where error-shape requirements are
not visible.

## Strategy

`heuristic`

## What to inspect

1. Review changed endpoint error paths.
2. Check whether failures return `ProblemDetails`, `ValidationProblemDetails`,
   or an equivalent stable error envelope.

## Pass criteria

- API failures use a consistent machine-readable shape.
- Validation, not-found, conflict, and domain failure paths fit the same
  contract family.

## Fail criteria

- Endpoints return raw exception strings, arbitrary anonymous JSON, or plain
  text errors for ordinary client failures.
- The API mixes multiple incompatible error shapes without a clear reason.

## Do not flag

- Internal tooling endpoints with no external contract.
- HTML/browser endpoints where HTTP API conventions do not apply.

## Evidence to collect

- The changed error responses.
- The inconsistent or ad hoc payload shape.

## Confidence guidance

- `HIGH`: the endpoint directly returns ad hoc error bodies.
- `MEDIUM`: a centralized error filter may exist but is not visible.
- `LOW`: prefer `unknown` if endpoint contract scope is unclear.

## Remediation

- Standardize on `ProblemDetails` or an equivalent documented error envelope.
- Keep domain-specific codes in extensions or typed fields, not free-form text
  only.

## Pass example

```csharp
return Results.Problem(
    title: "Order cannot be cancelled",
    detail: "The order has already shipped.",
    statusCode: StatusCodes.Status409Conflict);
```

## Fail example

```csharp
return Results.Json(new { error = ex.Message }, statusCode: 409);
```
