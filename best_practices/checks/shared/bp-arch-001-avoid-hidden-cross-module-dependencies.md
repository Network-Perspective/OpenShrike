# BP-ARCH-001: Avoid hidden cross-module dependencies

## Intent

Modules should depend on each other through explicit, reviewable boundaries.
Hidden dependencies make refactors dangerous, increase build times, and let
unowned coupling accumulate without anyone noticing.

## Applicability

Applies to repositories with more than one meaningful module, package,
component, service, or deployable boundary.

Return `unknown` when:

- the repository is too small to have module boundaries, or
- the dependency graph is not visible from the available evidence.

## Strategy

`heuristic`

## What to inspect

1. Review changed imports, references, package links, or service dependencies.
2. Check whether module A now depends on module B through a clearly intended API
   or ownership boundary.
3. Look for backdoor coupling through shared utils, internal package paths,
   private modules, or direct database/schema reach-through.

## Pass criteria

- Cross-module usage goes through an explicit API, contract, adapter, or
  published boundary.
- Ownership and dependency intent are visible from repository structure, module
  metadata, or surrounding code.

## Fail criteria

- A module reaches into another module's private internals.
- A change introduces an implicit dependency that bypasses the intended public
  boundary.
- A shared "utility" module becomes a transport layer for otherwise forbidden
  coupling.

## Do not flag

- Normal use of a published public API.
- Test-only dependencies that do not create production coupling.
- Small repos where the boundary would be artificial.

## Evidence to collect

- The new dependency edge.
- The internal or hidden path being used.
- Any missing public contract that would have made the dependency explicit.

## Confidence guidance

- `HIGH`: the hidden dependency edge is directly visible.
- `MEDIUM`: the boundary is strongly implied but not fully documented.
- `LOW`: prefer `unknown` if ownership structure is too ambiguous.

## Remediation

- Introduce or use an explicit public contract.
- Move the shared concern into a lower-level abstraction.
- Remove the backdoor dependency.
