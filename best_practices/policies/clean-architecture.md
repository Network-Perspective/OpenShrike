# Clean Architecture Policy

This policy is a cross-language architecture overlay for repositories that have
explicitly chosen Clean Architecture or a close relative such as hexagonal,
ports-and-adapters, onion, or inside/outside layering. It protects the
Dependency Rule, keeps business rules independent from details, and guards the
boundary contracts that make those details replaceable.

Use it when the repository clearly separates policy from details and you want
review to preserve that separation. Pair it with a language baseline if you
also want runtime- and ecosystem-specific checks.

## Policy metadata

- Policy ID: `clean-architecture`
- Scope: repositories that intentionally organize code around inner business
  rules and outer adapters/details
- Review mode: diff-first with repo expansion where layer ownership, boundary
  contracts, and dependency direction must be established

## Included supporting shared checks

- [bp-arch-001-avoid-hidden-cross-module-dependencies](../checks/shared/bp-arch-001-avoid-hidden-cross-module-dependencies.md)
- [bp-arch-002-dependency-direction-follows-boundaries](../checks/shared/bp-arch-002-dependency-direction-follows-boundaries.md)
- [bp-arch-003-composition-root-owns-wiring](../checks/shared/bp-arch-003-composition-root-owns-wiring.md)
- [bp-test-001-behavior-changes-covered](../checks/shared/bp-test-001-behavior-changes-covered.md)
- [bp-test-002-deterministic-tests](../checks/shared/bp-test-002-deterministic-tests.md)
- [bp-test-003-default-tests-no-live-network](../checks/shared/bp-test-003-default-tests-no-live-network.md)
- [bp-doc-004-architectural-decisions-recorded](../checks/shared/bp-doc-004-architectural-decisions-recorded.md)

## Included Clean Architecture checks

- [clean-arch-001-dependency-rule-points-inward](../checks/architecture/clean-arch-001-dependency-rule-points-inward.md)
- [clean-arch-002-use-cases-own-application-business-rules](../checks/architecture/clean-arch-002-use-cases-own-application-business-rules.md)
- [clean-arch-003-inner-layer-owns-boundary-ports](../checks/architecture/clean-arch-003-inner-layer-owns-boundary-ports.md)
- [clean-arch-004-boundary-models-are-simple-and-isolated](../checks/architecture/clean-arch-004-boundary-models-are-simple-and-isolated.md)
- [clean-arch-005-details-stay-in-outer-adapters](../checks/architecture/clean-arch-005-details-stay-in-outer-adapters.md)
- [clean-arch-006-structure-screams-domain-and-use-cases](../checks/architecture/clean-arch-006-structure-screams-domain-and-use-cases.md)
- [clean-arch-007-core-behavior-is-testable-without-infrastructure](../checks/architecture/clean-arch-007-core-behavior-is-testable-without-infrastructure.md)

## Checks intentionally excluded from this policy

- Language- or framework-specific checks. Pair this policy with a language
  baseline when you want runtime-specific rules.
- Product-selection choices such as which database, web framework, or message
  bus to use. This policy checks whether those details stay at the edge, not
  which option you chose.
- Deployment topology choices such as monolith versus services unless the diff
  introduces a dependency, layering, or boundary violation. Clean Architecture
  can be implemented in multiple decoupling modes.
