# CLEAN-ARCH-007: Core behavior is testable without outer infrastructure

## Intent

Clean Architecture should make entities and use cases testable without a
browser, web server, database, live network, or other outer details. When core
behavior can be exercised only through full-stack infrastructure, the
architecture has likely leaked volatility inward.

## Applicability

Applies when the diff changes business rules, use cases, ports, or core
architectural boundaries in a repository that claims Clean Architecture or an
equivalent inside/outside split.

Return `unknown` when:

- the change is pure infrastructure with no core behavior impact,
- the repository has no visible automated test strategy, or
- the visible scope is too small to tell whether the core can be exercised
  independently.

## Strategy

`reasoning`

## What to inspect

1. Identify the changed core behavior and the tests, if any, that cover it.
2. Check whether the behavior can be exercised through use cases, entities, or
   a narrow testing API with fakes or stubs for outer ports.
3. Look for unnecessary dependence on GUI flows, web servers, databases, or
   other volatile infrastructure just to verify core rules.

## Pass criteria

- Core behavior changes are covered by tests that exercise entities, use cases,
  or narrow inward-facing seams without requiring outer infrastructure.
- Infrastructure-heavy tests, if present, complement rather than replace core
  behavioral tests.

## Fail criteria

- A business-rule change is verifiable only through GUI, full-stack, or
  infrastructure-coupled tests when a use case or entity seam should have
  existed.
- The tests are tightly coupled to volatile outer structure in a way that makes
  core changes or refactors unnecessarily expensive.

## Do not flag

- Adapter-specific integration tests that legitimately exercise persistence or
  transport code.
- End-to-end tests that are layered on top of focused core tests.
- Repositories where the changed behavior is purely outer-edge glue.

## Evidence to collect

- The changed core behavior.
- The nearest tests that exercise it, or the absence of such tests.
- The infrastructure dependency that makes the tests unnecessarily heavy.

## Confidence guidance

- `HIGH`: the diff changes core behavior and only infrastructure-coupled tests
  are available.
- `MEDIUM`: some core seams exist, but the changed behavior is still covered in
  a brittle or overly indirect way.
- `LOW`: prefer `unknown` when test coverage or architecture visibility is too
  limited to judge.

## Remediation

- Add or extend use case or entity tests with stubs/fakes for outer ports.
- Introduce a narrow testing API if direct core testing is awkward.
- Keep volatile UI, transport, and persistence concerns out of the core test
  path.
