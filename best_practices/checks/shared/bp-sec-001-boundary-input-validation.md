# BP-SEC-001: External input is validated at trust boundaries

## Intent

The system should reject invalid, malicious, or semantically impossible input
at the boundary before it reaches business logic, persistence, or privileged
operations.

## Applicability

Applies to HTTP endpoints, RPC handlers, CLIs, webhooks, message consumers,
background job payloads, and any other boundary where untrusted input enters the
system.

Return `unknown` when the boundary validation pipeline is not visible.

## Strategy

`heuristic`

## What to inspect

1. Identify changed external input models and handlers.
2. Check whether required fields, ranges, enum values, and invariants are
   validated before side effects begin.

## Pass criteria

- Boundary validation is explicit and reviewable.
- Invalid input is rejected before persistence or business side effects.

## Fail criteria

- Untrusted input flows directly into business logic, command execution,
  persistence, or authorization decisions with no visible validation.

## Do not flag

- Internal method calls that are not trust boundaries.
- Validation that is clearly centralized and visible elsewhere in scope.

## Evidence to collect

- The external input boundary.
- The missing or insufficient validation path.

## Confidence guidance

- `HIGH`: unvalidated external input directly reaches a sensitive path.
- `MEDIUM`: validation may exist elsewhere, but is not visible in the diff.
- `LOW`: prefer `unknown` if the boundary handling is only partially visible.

## Remediation

- Add explicit boundary validation and fail fast on invalid input.
