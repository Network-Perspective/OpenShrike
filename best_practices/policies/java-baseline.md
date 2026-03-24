# Java Baseline Policy

This is the default high-signal policy for Java services, workers, libraries,
and Spring-based applications.

## Policy metadata

- Policy ID: `java-baseline`
- Scope: Java repositories

## Included shared checks

- [bp-arch-001-avoid-hidden-cross-module-dependencies](../checks/shared/bp-arch-001-avoid-hidden-cross-module-dependencies.md)
- [bp-arch-002-dependency-direction-follows-boundaries](../checks/shared/bp-arch-002-dependency-direction-follows-boundaries.md)
- [bp-arch-003-composition-root-owns-wiring](../checks/shared/bp-arch-003-composition-root-owns-wiring.md)
- [bp-test-001-behavior-changes-covered](../checks/shared/bp-test-001-behavior-changes-covered.md)
- [bp-test-002-deterministic-tests](../checks/shared/bp-test-002-deterministic-tests.md)
- [bp-test-003-default-tests-no-live-network](../checks/shared/bp-test-003-default-tests-no-live-network.md)
- [bp-sec-001-boundary-input-validation](../checks/shared/bp-sec-001-boundary-input-validation.md)
- [bp-sec-002-no-committed-secrets](../checks/shared/bp-sec-002-no-committed-secrets.md)
- [bp-sec-003-no-privileged-review-commands](../checks/shared/bp-sec-003-no-privileged-review-commands.md)
- [bp-sec-004-sensitive-data-not-logged](../checks/shared/bp-sec-004-sensitive-data-not-logged.md)
- [bp-rel-001-outbound-dependencies-have-time-budgets](../checks/shared/bp-rel-001-outbound-dependencies-have-time-budgets.md)
- [bp-rel-002-retries-are-bounded-and-safe](../checks/shared/bp-rel-002-retries-are-bounded-and-safe.md)
- [bp-ops-001-meaningful-health-signals](../checks/shared/bp-ops-001-meaningful-health-signals.md)
- [bp-ops-005-environment-agnostic-deployment-config](../checks/shared/bp-ops-005-environment-agnostic-deployment-config.md)
- [bp-api-001-machine-readable-errors](../checks/shared/bp-api-001-machine-readable-errors.md)
- [bp-api-002-bounded-collection-reads](../checks/shared/bp-api-002-bounded-collection-reads.md)
- [bp-doc-004-architectural-decisions-recorded](../checks/shared/bp-doc-004-architectural-decisions-recorded.md)

## Included Java-specific checks

- [java-arch-001-constructor-injection-over-field-injection](../checks/java/java-arch-001-constructor-injection-over-field-injection.md)
- [java-arch-002-validated-configuration-properties](../checks/java/java-arch-002-validated-configuration-properties.md)
- [java-sec-001-no-native-java-deserialization](../checks/java/java-sec-001-no-native-java-deserialization.md)
- [java-sec-002-process-builder-input-validated](../checks/java/java-sec-002-process-builder-input-validated.md)
- [java-sec-003-parameterized-sql](../checks/java/java-sec-003-parameterized-sql.md)
- [java-rel-001-http-clients-have-timeouts](../checks/java/java-rel-001-http-clients-have-timeouts.md)
- [java-rel-002-thread-interrupts-are-not-swallowed](../checks/java/java-rel-002-thread-interrupts-are-not-swallowed.md)
