# BP-ARCH-003: Composition stays in the composition root

## Intent

Object wiring, service location, and application assembly should happen at the
edge of the system, not deep inside business logic. Keeping composition in one
place makes dependencies reviewable and runtime failures easier to detect.

## Applicability

Applies to applications that assemble services, handlers, workflows, or plugin
graphs.

Return `unknown` when the repository is a tiny script or the assembly pattern is
not visible.

## Strategy

`reasoning`

## What to inspect

1. Review how changed code acquires collaborators.
2. Check whether runtime code is instantiating or resolving dependencies ad hoc
   instead of receiving them through explicit seams.

## Pass criteria

- Business logic receives collaborators through constructors, factories, or
  explicit arguments.
- Dynamic composition remains isolated to startup, bootstrap, or plugin code.

## Fail criteria

- Business logic reaches into a container, registry, or global factory to pull
  dependencies at runtime.
- New code hides required collaborators behind ad hoc object creation.

## Do not flag

- Framework bootstrap code.
- Well-scoped factories whose purpose is to defer creation behind an explicit
  contract.

## Evidence to collect

- The runtime resolution or ad hoc construction site.
- The hidden dependency it introduces.

## Confidence guidance

- `HIGH`: service-location or hidden wiring is directly visible.
- `MEDIUM`: the code likely hides composition, but some wiring is out of scope.
- `LOW`: prefer `unknown` if the ownership boundary is unclear.

## Remediation

- Move composition to the application entry point or container setup.
- Introduce an explicit factory or contract for late binding.
