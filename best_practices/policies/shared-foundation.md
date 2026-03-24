# Shared Foundation Policy

This policy contains cross-language checks that should apply to most serious
software repositories regardless of implementation language. It is the common
baseline that language-specific policies should layer on top of rather than
restate.

## Policy metadata

- Policy ID: `shared-foundation`
- Scope: multi-language repositories
- Review mode: diff-first with repo expansion where structural evidence is
  required

## Included checks

### Architecture

- [bp-arch-001-avoid-hidden-cross-module-dependencies](../checks/shared/bp-arch-001-avoid-hidden-cross-module-dependencies.md)
- [bp-arch-002-dependency-direction-follows-boundaries](../checks/shared/bp-arch-002-dependency-direction-follows-boundaries.md)
- [bp-arch-003-composition-root-owns-wiring](../checks/shared/bp-arch-003-composition-root-owns-wiring.md)

### Testing

- [bp-test-001-behavior-changes-covered](../checks/shared/bp-test-001-behavior-changes-covered.md)
- [bp-test-002-deterministic-tests](../checks/shared/bp-test-002-deterministic-tests.md)
- [bp-test-003-default-tests-no-live-network](../checks/shared/bp-test-003-default-tests-no-live-network.md)

### Security

- [bp-sec-001-boundary-input-validation](../checks/shared/bp-sec-001-boundary-input-validation.md)
- [bp-sec-002-no-committed-secrets](../checks/shared/bp-sec-002-no-committed-secrets.md)
- [bp-sec-003-no-privileged-review-commands](../checks/shared/bp-sec-003-no-privileged-review-commands.md)
- [bp-sec-004-sensitive-data-not-logged](../checks/shared/bp-sec-004-sensitive-data-not-logged.md)

### Reliability

- [bp-rel-001-outbound-dependencies-have-time-budgets](../checks/shared/bp-rel-001-outbound-dependencies-have-time-budgets.md)
- [bp-rel-002-retries-are-bounded-and-safe](../checks/shared/bp-rel-002-retries-are-bounded-and-safe.md)

### Operations

- [bp-ops-001-meaningful-health-signals](../checks/shared/bp-ops-001-meaningful-health-signals.md)
- [bp-ops-005-environment-agnostic-deployment-config](../checks/shared/bp-ops-005-environment-agnostic-deployment-config.md)

### API design

- [bp-api-001-machine-readable-errors](../checks/shared/bp-api-001-machine-readable-errors.md)
- [bp-api-002-bounded-collection-reads](../checks/shared/bp-api-002-bounded-collection-reads.md)

### Documentation

- [bp-doc-004-architectural-decisions-recorded](../checks/shared/bp-doc-004-architectural-decisions-recorded.md)

## Output contract

Each check must emit:

- `id`
- `version`
- `status`
- `confidence`
- `evidence`
- `rationale`
- `remediation`
