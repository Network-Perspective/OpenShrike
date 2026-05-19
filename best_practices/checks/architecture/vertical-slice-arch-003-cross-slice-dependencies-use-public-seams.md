# VERTICAL-SLICE-ARCH-003: Cross-slice dependencies go through public seams

## Intent

Vertical slices should be cohesive internally and loosely coupled to each
other. When one slice needs something from another, the dependency should go
through an explicit contract, event, API, read model, or shared kernel seam,
not another slice's private internals.

## Applicability

Applies to repositories with two or more identifiable feature slices.

Return `unknown` when:

- the slice boundaries are not visible,
- only one slice is in scope, or
- the repository is too small for cross-slice coupling to matter.

## Strategy

`heuristic`

## What to inspect

1. Identify imports, references, or calls from one slice into another.
2. Determine whether the called code is a published seam or an internal
   implementation detail.
3. Check whether the dependency could instead flow through a contract, event,
   adapter, or shared low-level module.

## Pass criteria

- Cross-slice collaboration goes through an explicit public seam.
- Shared code used by multiple slices lives in a genuinely shared lower-level
  module rather than inside one slice's internals.

## Fail criteria

- One slice directly imports or calls another slice's handler, validator,
  repository implementation, internal helper, or other private implementation
  detail.
- A slice reaches through another slice to its persistence or UI code instead
  of using a stable contract.

## Do not flag

- Composition-root wiring.
- Test-only helpers.
- Shared kernel modules whose purpose is clearly cross-slice reuse.

## Evidence to collect

- The dependency edge between slices.
- The internal code being reached into.
- The missing public seam that would have kept the slices decoupled.

## Confidence guidance

- `HIGH`: the private cross-slice dependency is directly visible.
- `MEDIUM`: the dependency likely violates slice boundaries, but public/private
  intent is partly inferred from names and layout.
- `LOW`: prefer `unknown` when slice ownership is ambiguous.

## Remediation

- Introduce or use a published contract, event, read model, or adapter.
- Move truly shared logic to a shared lower-level module.
- Stop importing another slice's internal implementation directly.
