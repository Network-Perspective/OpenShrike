# VERTICAL-SLICE-ARCH-002: Slice changes stay local to the use case

## Intent

Code that changes together should live together. In a vertical-slice codebase,
adding or changing one behavior should usually concentrate edits in one slice
plus a small number of stable shared seams.

## Applicability

Applies when:

- the repository already uses vertical slices, and
- the diff appears to implement or modify one use case or a small set of
  closely related behaviors.

Return `unknown` when:

- the change is intentionally cross-cutting,
- the diff is a broad refactor, migration, or platform change, or
- the review scope is too small to identify the primary behavior under change.

## Strategy

`reasoning`

## What to inspect

1. Identify the primary use case or behavior in the diff.
2. Review whether most of the edits stay inside one slice and its tests.
3. Inspect edits outside the slice and decide whether they are limited to
   composition, shared contracts, infrastructure, or other stable seams.

## Pass criteria

- Most behavior-specific edits stay in the owning slice and its tests.
- Any edits outside the slice are narrow, deliberate, and clearly explained by
  a stable shared boundary.

## Fail criteria

- A narrow feature requires broad coordinated edits across generic shared
  services, repositories, controllers, validators, or multiple unrelated
  slices.
- The diff spreads one behavior across many places without a durable boundary
  reason such as composition, schema evolution, or a shared contract.

## Do not flag

- Schema or contract changes that genuinely affect multiple slices.
- Code moves that improve slice locality.
- Repository-wide security, observability, or platform changes.

## Evidence to collect

- The files touched in the owning slice.
- The out-of-slice edits and why they were needed.
- Whether the surrounding structure suggests the change could have stayed local.

## Confidence guidance

- `HIGH`: the diff is clearly for one behavior and still scatters edits across
  unrelated layers or slices.
- `MEDIUM`: the change seems overly distributed, but some supporting context is
  outside scope.
- `LOW`: prefer `unknown` when the change may be intentionally cross-cutting.

## Remediation

- Pull behavior-specific logic back into the owning slice.
- Narrow edits outside the slice to explicit contracts, composition, or
  infrastructure seams.
- Delay extra abstractions until a second real slice needs them.
