# CSHARP-SEC-004: Protected operations enforce authorization at the boundary

## Intent

Sensitive operations should be protected where the request enters the system.
Boundary authorization is easier to review, harder to bypass, and less likely
to drift than scattered ad hoc checks.

## Applicability

Applies to HTTP endpoints, gRPC methods, hubs, message handlers, and other
entry points that mutate state or expose protected data.

Return `unknown` when the route or consumer exposure level is unclear.

## Strategy

`heuristic`

## What to inspect

1. Find entry points added or changed in the diff.
2. Determine whether the operation is public, authenticated, privileged, or
   data-sensitive.
3. Check for `[Authorize(Policy = ...)]`, endpoint authorization requirements,
   or an equivalent explicit boundary guard.

## Pass criteria

- Protected operations require authorization at the boundary.
- Authorization is expressed through named policies or equivalently reviewable
  rules.

## Fail criteria

- A protected operation has no visible authorization guard.
- Authorization depends only on buried handler logic or manual string role
  checks.
- A mutation endpoint is inadvertently exposed as anonymous.

## Do not flag

- Clearly public endpoints such as login, health, or webhook endpoints that use
  a different explicit auth mechanism.
- Internal-only code not exposed as a boundary.
- Resource-level checks that complement, rather than replace, boundary auth.

## Evidence to collect

- The protected entry point.
- The missing or weak authorization mechanism.

## Confidence guidance

- `HIGH`: a privileged route is visible with no boundary authorization.
- `MEDIUM`: the operation looks sensitive, but route exposure or central policy
  wiring is partly inferred.
- `LOW`: prefer `unknown` if the entry-point visibility is unclear.

## Remediation

- Add a named authorization policy at the entry point.
- Keep resource checks as a second layer, not the only layer.

## Pass example

```csharp
[Authorize(Policy = Policies.Admin)]
[HttpDelete("/users/{id:guid}")]
public Task<IActionResult> DeleteUser(Guid id, CancellationToken ct) => ...
```

## Fail example

```csharp
[HttpDelete("/users/{id:guid}")]
public Task<IActionResult> DeleteUser(Guid id, CancellationToken ct) => ...
```
