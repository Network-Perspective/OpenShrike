---
id: baseline-lang-pytorch
title: Baseline PyTorch Language Policy
kind: language
includes: [baseline-shared-foundation]
check-count: 20
---

# Policy: Baseline PyTorch Language Policy

Minimal PyTorch starter policy. It includes `baseline-shared-foundation` and adds one high-signal PyTorch-specific check. Use it when you want low-noise onboarding coverage before moving up to `lang-pytorch`.

## Language-Specific Checks

### Any app type
- [pytorch-rel-001](../checks/pytorch/pytorch-rel-001-correct-train-eval-mode-switching.md) — Training and evaluation use the correct module mode.

## Shared Foundation Checks


### Security
- [sec-006](../checks/shared/sec/sec-006-boundary-auth-and-principal-scoping.md) — Protected operations enforce authentication, authorization, and principal scoping at the boundary.
- [bp-sec-001](../checks/shared/sec/bp-sec-001-boundary-input-validation.md) — External input is validated at trust boundaries.
- [bp-sec-004](../checks/shared/sec/bp-sec-004-sensitive-data-not-emitted-to-logs-or-traces.md) — Sensitive data is not emitted to logs or traces.
- [sec-008](../checks/shared/sec/sec-008-public-responses-do-not-leak-secrets-or-internals.md) — Client-facing errors, URLs, and public responses do not leak secrets or internals.

### Reliability
- [bp-rel-001](../checks/shared/rel/bp-rel-001-outbound-dependencies-have-explicit-time-budgets.md) — Outbound dependencies have explicit time budgets.
- [bp-rel-002](../checks/shared/rel/bp-rel-002-retries-are-bounded-deliberate-and-safe.md) — Retries are bounded, deliberate, and safe for the operation.
- [rel-006](../checks/shared/rel/rel-006-retried-or-redelivered-work-is-idempotent-or-deduplicated.md) — Retried or redelivered work is idempotent or deduplicated.
- [rel-017](../checks/shared/rel/rel-017-side-effects-run-after-durable-commit.md) — Side effects and downstream jobs run only after durable commit.
- [rel-008](../checks/shared/rel/rel-008-overload-work-and-resource-consumption-are-bounded.md) — Overload-triggering work and resource consumption are bounded.

### Architecture Core
- [bp-arch-001](../checks/shared/arch-core/bp-arch-001-modules-depend-through-explicit-reviewable-seams.md) — Modules depend through explicit, reviewable seams.
- [bp-arch-002](../checks/shared/arch-core/bp-arch-002-dependency-direction-follows-the-architecture-instead-of-bypassing-it.md) — Dependency direction follows the architecture instead of bypassing it.

### Application Programming Interface
- [api-004](../checks/shared/api/api-004-retried-mutating-operations-idempotent-end-to-end.md) — Retried mutating operations are idempotent end-to-end.
- [api-009](../checks/shared/api/api-009-published-api-contracts-backward-compatible.md) — Published API contracts remain backward compatible within a version.
- [bp-api-001](../checks/shared/api/bp-api-001-machine-readable-error-contracts.md) — External APIs return machine-readable error contracts.

### Data
- [data-011](../checks/shared/data/data-011-durable-state-mutations-are-atomic-rollback-safe-and-concurrency-correct.md) — Durable-state mutations are atomic, rollback-safe, and concurrency-correct.

### Operations
- [ops-022](../checks/shared/ops/ops-022-configuration-is-semantically-validated-before-apply.md) — Configuration is semantically validated before it is applied.
- [bp-ops-001](../checks/shared/ops/bp-ops-001-meaningful-health-signals.md) — Services expose meaningful health signals.
- [ops-017](../checks/shared/ops/ops-017-per-unit-production-telemetry-is-structured-and-complete.md) — Per-unit production telemetry is structured and complete.
- [ops-018](../checks/shared/ops/ops-018-cross-boundary-work-preserves-correlation-and-dependency-attribution.md) — Cross-boundary work preserves correlation and dependency attribution.
