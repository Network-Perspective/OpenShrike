# CLEAN-ARCH-004: Boundary data is simple, isolated, and framework-free

## Intent

Data that crosses architecture boundaries should be simple data structures
shaped for the inner side of the boundary. Passing framework requests, ORM
rows, UI widget models, or other outer-circle types inward leaks details and
couples core policy to mechanisms.

## Applicability

Applies when the diff changes method signatures, request/response objects,
presenter/view models, gateway contracts, or other data that crosses a Clean
Architecture boundary.

Return `unknown` when:

- no boundary crossing is visible,
- all changed types stay within a single layer, or
- the repository does not expose clear architectural seams.

## Strategy

`heuristic`

## What to inspect

1. Identify the boundary crossings touched by the diff.
2. Review the parameter and return types used at those crossings.
3. Check whether the boundary data structures are simple and independent, or
   whether they drag framework or storage concerns inward.

## Pass criteria

- Boundary methods use simple DTOs, structs, records, commands, queries, or
  similarly isolated data structures.
- Those data structures do not depend on web, ORM, database, UI, or transport
  framework types.

## Fail criteria

- A use case accepts or returns `HttpRequest`/`HttpResponse`, ORM entities,
  database row objects, framework serialization envelopes, or UI-specific view
  types.
- A gateway returns storage-shaped records directly into the core instead of
  mapping them to inward-facing data.

## Do not flag

- Plain data structures that may contain domain values but carry no outer-layer
  dependencies.
- Serialization or transport models that remain entirely inside outer adapters.
- Internal helper types that do not cross an architectural boundary.

## Evidence to collect

- The boundary method or port signature.
- The outer-layer type or dependency being passed across.
- The inner layer that is now forced to know that type.

## Confidence guidance

- `HIGH`: the changed signature directly exposes a framework or storage type to
  an inner layer.
- `MEDIUM`: the boundary is clear, but some type ownership is inferred from
  naming or package layout.
- `LOW`: prefer `unknown` when it is unclear whether the data actually crosses a
  boundary.

## Remediation

- Introduce inward-facing request, response, or view-model data structures.
- Map framework, ORM, and transport types at the adapter edge.
- Keep entities and storage formats on their respective sides of the boundary.
