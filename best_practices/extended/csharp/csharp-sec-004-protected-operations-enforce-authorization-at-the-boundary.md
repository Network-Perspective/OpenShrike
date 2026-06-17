---
id: csharp-sec-004
title: Protected operations enforce authorization at the boundary
domain: sec
language: csharp
app-type: [http-service, batch-job, other]
status: active
sources: []
---

# csharp-sec-004: Protected operations enforce authorization at the boundary

## Intent
Sensitive operations should be protected where the request enters the system. Boundary authorization is easier to review, harder to bypass, and less likely to drift than scattered ad hoc checks.

## Applicability
Applies to HTTP endpoints, gRPC methods, hubs, message handlers, and other entry points that mutate state or expose protected data. Return `unknown` when route or consumer exposure is unclear.

## What to inspect
Changed entry points, whether the operation is public or protected, and `[Authorize(Policy = ...)]`, endpoint authorization requirements, or equivalent explicit boundary guards.

## Pass criteria
Protected operations require authorization at the boundary, expressed through named policies or equivalently reviewable rules.

## Fail criteria
A protected operation has no visible authorization guard, depends only on buried handler logic or manual string role checks, or a mutation endpoint is inadvertently exposed as anonymous.

## Do not flag
Clearly public endpoints such as login, health, or webhooks that use a different explicit auth mechanism. Internal-only code not exposed as a boundary. Resource-level checks that complement boundary auth.

## Confidence guidance
`HIGH` when a privileged route is visible with no boundary authorization. `MEDIUM` when exposure is inferred. `LOW` when entry-point visibility is unclear.

## Remediation
Add a named authorization policy at the entry point and keep resource checks as a second layer.

## Pass example
```csharp
[Authorize(Policy = Policies.Admin)]
[HttpDelete("/users/{id:guid}")]
public Task<IActionResult> DeleteUser(Guid id) => ...
```

## Fail example
```csharp
[HttpDelete("/users/{id:guid}")]
public Task<IActionResult> DeleteUser(Guid id) => ...
```
