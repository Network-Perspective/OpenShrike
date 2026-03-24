# BP-ARCH-002: Dependency direction follows architectural boundaries

## Intent

Architecture should have a clear dependency direction. High-level policy and
domain logic should not depend directly on lower-level details such as
transport, persistence, or UI frameworks.

## Applicability

Applies to layered, modular, hexagonal, and service-oriented systems with
identifiable boundaries.

Return `unknown` when no meaningful layering is visible.

## Strategy

`heuristic`

## What to inspect

1. Determine the intended boundary from repo layout, names, or existing code.
2. Review changed dependencies for new inward-to-outward or domain-to-framework
   violations.

## Pass criteria

- Dependency direction matches the apparent architecture.
- High-level logic depends on abstractions, not directly on implementation
  details.

## Fail criteria

- Domain or application logic directly imports transport, persistence, or UI
  implementation details.
- The diff introduces a reverse dependency that collapses the intended layering.

## Do not flag

- Composition-root code.
- Thin adapters whose job is to translate between layers.
- Repositories too small to justify explicit layering.

## Evidence to collect

- The layer-violating dependency.
- The architectural boundary it bypasses.

## Confidence guidance

- `HIGH`: the reverse dependency is directly visible.
- `MEDIUM`: the intended layering is inferred from names and layout.
- `LOW`: prefer `unknown` when architectural intent is unclear.

## Remediation

- Invert the dependency through an interface or contract.
- Move framework-specific code to an adapter boundary.
