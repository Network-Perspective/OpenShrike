# CLEAN-ARCH-001: Source code dependencies point inward toward policy

## Intent

Clean Architecture works only when source code dependencies point from
lower-level details toward higher-level policy. Inner layers must not know the
names of frameworks, adapters, transports, databases, or other outer-circle
mechanisms.

## Applicability

Applies when the repository has clearly chosen Clean Architecture or a close
relative such as hexagonal, ports-and-adapters, onion, or inside/outside
layering.

Return `unknown` when:

- the repository architecture is unclear,
- the diff touches only a tiny leaf implementation with no visible boundary, or
- the visible scope is insufficient to establish which code is inner versus
  outer.

## Strategy

`heuristic`

## What to inspect

1. Identify the apparent inner layers such as entities, domain, core, use
   cases, or application.
2. Review changed imports, inheritance edges, annotations, and direct calls
   that cross between inner and outer layers.
3. Check whether new dependency edges point inward toward policy, or outward
   toward details.

## Pass criteria

- Inner-layer code depends only on same-layer or more inward policy code, plus
  stable language/runtime facilities.
- Outer adapters, frameworks, and drivers depend inward on core contracts
  instead of being depended on by core policy.

## Fail criteria

- A domain, entity, use case, or application module imports or inherits from a
  controller, presenter, ORM type, repository implementation, web framework,
  transport object, or other outer detail.
- A new dependency edge forces higher-level policy code to mention an outer
  adapter or framework by name.

## Do not flag

- Composition-root or bootstrap code.
- Thin outer adapters whose job is to translate between layers.
- Stable standard-library dependencies that are not part of the repository's
  architectural boundaries.

## Evidence to collect

- The dependency edge that crosses the boundary.
- The apparent role of the source and target modules.
- Why that edge points outward instead of inward toward policy.

## Confidence guidance

- `HIGH`: the inner layer directly imports or inherits from an outer detail.
- `MEDIUM`: the layering is apparent, but some layer ownership is inferred from
  names and layout.
- `LOW`: prefer `unknown` when the intended layering cannot be established.

## Remediation

- Move detail-specific code to an outer adapter or driver.
- Introduce an inward-facing port or interface and invert the dependency.
- Keep inner policy code free of names declared in outer layers.
