# BP-API-001: External APIs return machine-readable error contracts

## Intent

Clients should not have to scrape arbitrary text to understand failures.
Reviewable APIs use stable error envelopes that callers can reason about
programmatically.

## Applicability

Applies to HTTP, RPC, CLI, or messaging interfaces consumed outside the current
module or service boundary.

Return `unknown` when the error contract is owned elsewhere and not visible.

## Strategy

`heuristic`

## What to inspect

1. Review changed error paths at external boundaries.
2. Check whether failures return a documented, consistent error shape.

## Pass criteria

- Error responses are structured and consistent across the interface.

## Fail criteria

- The interface returns ad hoc strings or incompatible payload shapes for normal
  client-visible failures.

## Do not flag

- Internal-only exceptions not exposed as a contract.
- Browser/UI HTML flows where API semantics do not apply.

## Evidence to collect

- The boundary error path.
- The ad hoc or inconsistent error contract.

## Confidence guidance

- `HIGH`: the inconsistent or ad hoc error payload is directly visible.
- `MEDIUM`: a central error mapper may exist out of scope.
- `LOW`: prefer `unknown` if contract ownership is unclear.

## Remediation

- Standardize on a documented error envelope.
- Keep structured codes and fields stable for callers.
