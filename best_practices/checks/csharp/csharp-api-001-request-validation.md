# CSHARP-API-001: External inputs are validated at the boundary

## Intent

Validation belongs at the boundary where the system accepts external input.
Boundary validation prevents invalid state from leaking into business logic and
keeps failure behavior predictable.

## Applicability

Applies to HTTP endpoints, gRPC methods, queue consumers, webhooks, and command
handlers that accept external input.

Return `unknown` when the boundary layer is not visible or validation is
centralized outside the reviewed scope.

## Strategy

`heuristic`

## What to inspect

1. Identify changed external input DTOs or handlers.
2. Check whether required fields, ranges, enum values, ownership, and
   cross-field invariants are validated before business logic executes.

## Pass criteria

- Boundary code uses model validation, FluentValidation, endpoint filters,
  guard clauses, or equivalent explicit validation.
- Invalid input fails fast with a client-visible validation error.

## Fail criteria

- External input is used directly for persistence, authorization, or business
  decisions with no visible validation.
- Validation is deferred until after side effects begin.

## Do not flag

- Simple route constraints already enforced by the framework.
- Internal method calls that are not external boundaries.
- Validation implemented in a centralized pipeline that is clearly visible.

## Evidence to collect

- The input model or handler.
- The missing validation of required constraints.

## Confidence guidance

- `HIGH`: unvalidated external input flows directly into business logic.
- `MEDIUM`: validation may exist outside the visible handler.
- `LOW`: prefer `unknown` if the boundary pipeline is incomplete in scope.

## Remediation

- Add explicit boundary validation.
- Reject invalid requests before business logic or side effects run.

## Pass example

```csharp
app.MapPost("/orders", async ([FromBody] CreateOrderRequest request, IValidator<CreateOrderRequest> validator, CancellationToken ct) =>
{
    var validation = await validator.ValidateAsync(request, ct);
    if (!validation.IsValid)
    {
        return Results.ValidationProblem(validation.ToDictionary());
    }

    return Results.Accepted();
});
```

## Fail example

```csharp
app.MapPost("/orders", async ([FromBody] CreateOrderRequest request, AppDbContext db) =>
{
    db.Orders.Add(new Order(request.CustomerId, request.Total));
    await db.SaveChangesAsync();
    return Results.Ok();
});
```
