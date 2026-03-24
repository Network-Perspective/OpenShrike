# TYPESCRIPT-ARCH-001: External data is not cast directly into trusted types

## Intent

TypeScript types disappear at runtime. Casting external data with `as` or angle
bracket assertions does not validate the payload and creates a false sense of
safety.

## Applicability

Applies when the code accepts HTTP bodies, queue payloads, environment config,
JSON from external services, or any other runtime data crossing a trust
boundary.

Return `unknown` when runtime validation may exist in helpers outside scope.

## Strategy

`heuristic`

## What to inspect

1. Review trust-boundary parsing and handler code.
2. Look for `as SomeType`, non-null assertions, or broad casts applied directly
   to external data.
3. Check whether runtime validation occurs first.

## Pass criteria

- External data is validated at runtime before being treated as a trusted type.

## Fail criteria

- Request or message payloads are cast directly into trusted domain types with
  no runtime validation.
- Environment config is asserted into a trusted shape without verification.

## Do not flag

- Narrow internal refactors where the value is already validated earlier and
  that validation is visible.
- Test fixtures and deliberate negative test cases.

## Evidence to collect

- The external data source.
- The unsafe cast or assertion applied to it.

## Confidence guidance

- `HIGH`: external data is directly cast to a trusted type without validation.
- `MEDIUM`: validation may happen elsewhere, but is not visible.
- `LOW`: prefer `unknown` if data provenance is unclear.

## Remediation

- Validate external data at runtime first.
- Convert validated payloads into trusted types only after the check passes.
