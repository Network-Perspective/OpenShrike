---
id: csharp-api-001
title: External inputs are validated at the boundary
domain: api
language: csharp
app-type: [http-service, batch-job, other]
status: active
sources: []
---

# csharp-api-001: External inputs are validated at the boundary

## Intent
Validation belongs at the entrypoint where .NET code accepts external input.

## Applicability
Applies to ASP.NET endpoints, gRPC handlers, queue consumers, webhooks, and command handlers. Return `unknown` when validation is centralized in an out-of-scope pipeline.

## What to inspect
Changed request DTOs, validators, endpoint filters, model binding, and whether invalid input can reach business logic before the framework returns a client error.

## Pass criteria
Boundary code uses model validation, FluentValidation, endpoint filters, or equivalent explicit validation before business logic executes.

## Fail criteria
External input flows from model binding straight into persistence, authorization, or business decisions with no visible validation, or validation happens only after side effects begin.

## Do not flag
Simple route constraints already enforced by the framework, internal method calls that are not external boundaries, or centralized validation pipelines that are clearly visible.

## Confidence guidance
`HIGH` when invalid external input is used directly. `MEDIUM` when validation may exist in shared middleware. `LOW` when the boundary pipeline is only partially visible.

## Remediation
Add explicit boundary validation and reject invalid requests before business logic or side effects run.

## Pass example
```csharp
var result = await validator.ValidateAsync(request, ct);
if (!result.IsValid) return Results.ValidationProblem(result.ToDictionary());
```

## Fail example
```csharp
db.Orders.Add(new Order(request.CustomerId, request.Total));
await db.SaveChangesAsync(ct);
```
