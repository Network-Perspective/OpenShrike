# PyTorch Baseline Policy

This policy extends the Python ML baseline for repositories that train or serve
models with PyTorch.

## Policy metadata

- Policy ID: `pytorch-baseline`
- Scope: PyTorch training, evaluation, and inference repositories

## Included shared, Python, and ML checks

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
- [bp-doc-004-architectural-decisions-recorded](../checks/shared/bp-doc-004-architectural-decisions-recorded.md)
- [python-arch-001-no-import-time-side-effects](../checks/python/python-arch-001-no-import-time-side-effects.md)
- [python-arch-002-validated-settings-boundaries](../checks/python/python-arch-002-validated-settings-boundaries.md)
- [python-sec-001-subprocess-shell-safety](../checks/python/python-sec-001-subprocess-shell-safety.md)
- [python-sec-002-no-unsafe-deserialization](../checks/python/python-sec-002-no-unsafe-deserialization.md)
- [python-sec-003-parameterized-sql](../checks/python/python-sec-003-parameterized-sql.md)
- [python-rel-001-http-clients-have-timeouts](../checks/python/python-rel-001-http-clients-have-timeouts.md)
- [python-rel-002-async-code-does-not-block-event-loop](../checks/python/python-rel-002-async-code-does-not-block-event-loop.md)
- [python-ml-001-leak-free-data-splitting](../checks/python/python-ml-001-leak-free-data-splitting.md)
- [python-ml-002-evaluation-separated-from-training-data](../checks/python/python-ml-002-evaluation-separated-from-training-data.md)
- [python-ml-003-training-and-serving-share-preprocessing-contract](../checks/python/python-ml-003-training-and-serving-share-preprocessing-contract.md)
- [python-ml-004-experiments-are-reproducible](../checks/python/python-ml-004-experiments-are-reproducible.md)

## Included PyTorch-specific checks

- [pytorch-rel-001-correct-train-eval-mode-switching](../checks/python/pytorch-rel-001-correct-train-eval-mode-switching.md)
- [pytorch-rel-002-inference-uses-no-grad-or-inference-mode](../checks/python/pytorch-rel-002-inference-uses-no-grad-or-inference-mode.md)
- [pytorch-ops-001-checkpoints-store-state-dicts](../checks/python/pytorch-ops-001-checkpoints-store-state-dicts.md)
- [pytorch-rel-003-device-placement-is-explicit-and-consistent](../checks/python/pytorch-rel-003-device-placement-is-explicit-and-consistent.md)
