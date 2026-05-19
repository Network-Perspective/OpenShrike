# VERTICAL-SLICE-ARCH-001: New use cases land inside an owning slice

## Intent

Vertical Slice Architecture organizes behavior by feature or use case, not by
global technical layers. The code that handles one request or workflow should
have a visible home in a slice that expresses that capability.

## Applicability

Applies when the repository has clearly chosen a vertical-slice or feature-first
structure, such as:

- feature- or use-case-named folders,
- a `features/`, `slices/`, or similarly named top-level area, or
- an ADR or design note stating that the repo uses vertical slices.

Return `unknown` when:

- the repository architecture is unclear,
- the change is pure infrastructure or platform work, or
- the repository is too small for slice boundaries to be meaningful.

## Strategy

`heuristic`

## What to inspect

1. Establish whether the surrounding repository is already slice-oriented.
2. For each new or materially changed use case, identify the folder that owns
   the behavior.
3. Check whether handlers, endpoints, commands, queries, validation, and other
   use-case-specific code are colocated in that owning slice or clearly nested
   beneath it.

## Pass criteria

- New behavior is implemented in a feature or use-case slice with a clear
  owning directory.
- Thin framework entrypoints outside the slice delegate directly to that slice
  instead of pushing behavior into generic shared layers.

## Fail criteria

- A new feature is implemented mainly through global `controllers`,
  `services`, `repositories`, `validators`, or similarly horizontal folders
  with no clear owning slice.
- The diff introduces a new top-level technical layer that splits one use case
  across unrelated directories in a repository that otherwise presents itself
  as slice-oriented.

## Do not flag

- Framework-required route registration or bootstrap files that stay thin.
- Cross-cutting platform code such as logging, authentication middleware,
  migrations, or composition setup.
- Repositories that have not opted into slice boundaries.

## Evidence to collect

- The changed file layout for the use case.
- The owning slice, or the absence of one.
- Any thin entrypoint that proves the slice exists but stays at the edge.

## Confidence guidance

- `HIGH`: the repository is clearly slice-oriented and the diff still lands the
  feature in horizontal layers.
- `MEDIUM`: slice intent is visible, but some of the owning structure is only
  implied from names or neighboring code.
- `LOW`: prefer `unknown` if the architecture choice cannot be established.

## Remediation

- Create or extend a slice folder for the use case.
- Move behavior-specific handlers, validation, mapping, and persistence logic
  under the owning slice.
- Keep any required framework entrypoint thin and delegating.
