# Python Baseline Policy

This is the default high-signal policy for Python services, CLIs, workers, and
libraries. It layers Python runtime and ecosystem concerns on top of the shared
cross-language foundation.

## Policy metadata

- Policy ID: `python-baseline`
- Scope: Python repositories
- Review mode: diff-first with repo expansion where structural evidence is
  needed

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

## Included Python-specific checks

- [python-arch-001-no-import-time-side-effects](../checks/python/python-arch-001-no-import-time-side-effects.md)
- [python-arch-002-validated-settings-boundaries](../checks/python/python-arch-002-validated-settings-boundaries.md)
- [python-sec-001-subprocess-shell-safety](../checks/python/python-sec-001-subprocess-shell-safety.md)
- [python-sec-002-no-unsafe-deserialization](../checks/python/python-sec-002-no-unsafe-deserialization.md)
- [python-sec-003-parameterized-sql](../checks/python/python-sec-003-parameterized-sql.md)
- [python-rel-001-http-clients-have-timeouts](../checks/python/python-rel-001-http-clients-have-timeouts.md)
- [python-rel-002-async-code-does-not-block-event-loop](../checks/python/python-rel-002-async-code-does-not-block-event-loop.md)

## Checks intentionally excluded from baseline

- notebook-only workflow guidance,
- micro-optimization rules around list comprehensions versus generators,
- style-only lint rules.
