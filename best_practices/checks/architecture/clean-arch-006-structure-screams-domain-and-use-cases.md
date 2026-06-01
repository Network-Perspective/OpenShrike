# CLEAN-ARCH-006: Repository structure screams domain and use cases

## Intent

The visible structure of a Clean Architecture codebase should tell reviewers
what business capabilities or use cases the system supports, not merely which
frameworks or technical layers it happens to use.

## Applicability

Applies when the diff introduces or materially reorganizes top-level packages,
modules, folders, or coarse-grained components in a repository that presents
itself as Clean Architecture, hexagonal, or ports-and-adapters.

Return `unknown` when:

- the change is a small local fix with no structural signal,
- the repository is too small for this distinction to matter, or
- the architecture intent is not clear from the visible code.

## Strategy

`reasoning`

## What to inspect

1. Review the changed folders, packages, modules, or component names.
2. Determine whether new behavior has a visible home named in business,
   use-case, or component language.
3. Check whether the diff instead grows generic framework-first buckets such as
   `controllers`, `services`, `repositories`, or `models` with no clear owning
   capability.

## Pass criteria

- The changed structure makes the relevant business capability, use case, or
  coarse-grained component discoverable.
- Technical layering may still exist internally, but it does not obscure the
  owning domain or use-case boundary.

## Fail criteria

- New business behavior is implemented mainly by expanding generic technical
  buckets with no clear domain or use-case ownership.
- The top-level or newly introduced structure foregrounds framework mechanics
  while hiding the business capability under review.

## Do not flag

- Thin framework-required entry points.
- Existing legacy structure that the diff does not materially expand.
- Small utility or infrastructure modules that are not business-facing.

## Evidence to collect

- The changed structural layout.
- The business capability or use case the diff appears to implement.
- Why that capability is, or is not, discoverable from the resulting structure.

## Confidence guidance

- `HIGH`: a new feature lands in generic technical buckets despite a visible
  Clean Architecture structure.
- `MEDIUM`: the structural signal is mixed, but the diff still weakens domain
  discoverability.
- `LOW`: prefer `unknown` when the repository has not clearly opted into this
  kind of structure.

## Remediation

- Group code by domain concept, use case, or coarse-grained component.
- Keep technical layer details inside the owning component rather than as the
  primary top-level organization.
- Use package/module visibility controls where available to enforce the chosen
  structure.
