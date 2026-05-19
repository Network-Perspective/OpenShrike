# Vertical Slice Architecture Policy

This policy is a cross-language architecture overlay for repositories that have
explicitly chosen Vertical Slice Architecture. It protects slice ownership,
locality of change, and low coupling between slices without forcing a language
or framework choice.

Use it when the repository already organizes behavior by feature or use case
and you want review to guard that structure. Pair it with a language baseline
if you also want runtime- and ecosystem-specific checks.

## Policy metadata

- Policy ID: `vertical-slice-architecture`
- Scope: repositories that intentionally organize code by feature or use case
- Review mode: diff-first with repo expansion where slice structure must be
  established

## Included supporting shared checks

- [bp-arch-001-avoid-hidden-cross-module-dependencies](../checks/shared/bp-arch-001-avoid-hidden-cross-module-dependencies.md)
- [bp-arch-002-dependency-direction-follows-boundaries](../checks/shared/bp-arch-002-dependency-direction-follows-boundaries.md)
- [bp-arch-003-composition-root-owns-wiring](../checks/shared/bp-arch-003-composition-root-owns-wiring.md)
- [bp-test-001-behavior-changes-covered](../checks/shared/bp-test-001-behavior-changes-covered.md)
- [bp-test-002-deterministic-tests](../checks/shared/bp-test-002-deterministic-tests.md)
- [bp-doc-004-architectural-decisions-recorded](../checks/shared/bp-doc-004-architectural-decisions-recorded.md)

## Included Vertical Slice Architecture checks

- [vertical-slice-arch-001-feature-slices-own-use-cases](../checks/architecture/vertical-slice-arch-001-feature-slices-own-use-cases.md)
- [vertical-slice-arch-002-slice-changes-stay-local](../checks/architecture/vertical-slice-arch-002-slice-changes-stay-local.md)
- [vertical-slice-arch-003-cross-slice-dependencies-use-public-seams](../checks/architecture/vertical-slice-arch-003-cross-slice-dependencies-use-public-seams.md)
- [vertical-slice-arch-004-shared-abstractions-are-demand-driven](../checks/architecture/vertical-slice-arch-004-shared-abstractions-are-demand-driven.md)

## Checks intentionally excluded from this policy

- Language- or framework-specific checks. Pair this policy with a language
  baseline when you want runtime-specific rules.
- Operational and security checks that are unrelated to the repository's
  architectural style.
