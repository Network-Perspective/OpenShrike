---
id: lang-rust
title: Rust Language Policy
kind: language
includes: [shared-foundation]
check-count: 71
---

# Policy: Rust Language Policy

Merged Rust policy. It inlines the baseline `shared-foundation` checks and adds Rust-specific checks, including the language checks that previously lived in separate extended outputs. Enable for repositories with substantial Rust code. This policy already contains the shared foundation checks; add other `lang-*` policies only when the repo has another substantial implementation language.

## Language-Specific Checks

### Any app type
- [rel-rust-001](../checks/rust/rel-rust-001-async-rust-does-not-block-runtimes-or-hold-blocking-state-across-await.md) — Async Rust does not block runtimes or hold blocking state across await.
- [sec-rust-001](../checks/rust/sec-rust-001-unsafe-rust-soundness-contracts.md) — Unsafe Rust keeps explicit soundness contracts and avoids unsound primitives.
- [perf-rust-001](../checks/rust/perf-rust-001-offload-obvious-cpu-bound-work-from-async-tasks.md) — Offload obvious CPU-bound work from async tasks.
- [rel-rust-004](../checks/rust/rel-rust-004-destructors-and-unsafe-mutation-panic-safe-and-non-blocking.md) — Destructors and unsafe mutation remain panic-safe and non-blocking.
- [data-rust-033](../extended/rust/data-rust-033-initialize-raw-or-vector-storage-before-making-elements-visible.md) — Initialize raw or vector storage before making elements visible.
- [data-rust-034](../extended/rust/data-rust-034-handle-zero-sized-types-explicitly-in-unsafe-generic-storage.md) — Handle zero-sized types explicitly in unsafe generic storage.

### Library
- [api-rust-001](../checks/rust/api-rust-001-public-apis-return-explicit-errors.md) — Rust public APIs return explicit recoverable errors and keep public error context.
- [doc-rust-001](../extended/rust/doc-rust-001-public-rust-apis-document-errors-panics-and-safety-requirements.md) — Public Rust APIs document errors, panics, and safety requirements.

## Shared Foundation Checks

### Security
- [sec-006](../checks/shared/sec/sec-006-boundary-auth-and-principal-scoping.md) — Protected operations enforce authentication, authorization, and principal scoping at the boundary.
- [sec-003](../checks/shared/sec/sec-003-parameterized-sql-and-allowlisted-query-fragments.md) — SQL remains parameterized and structural query fragments are allowlisted.
- [bp-sec-001](../checks/shared/sec/bp-sec-001-boundary-input-validation.md) — External input is validated at trust boundaries.
- [sec-004](../checks/shared/sec/sec-004-browser-output-encodes-or-sanitizes-untrusted-content.md) — Browser output encodes or sanitizes untrusted content in the correct context.
- [sec-001](../checks/shared/sec/sec-001-untrusted-input-shell-process-execution.md) — Untrusted input does not reach shell or process execution unsafely.
- [sec-002](../checks/shared/sec/sec-002-untrusted-data-not-dynamically-executed-or-unsafely-deserialized.md) — Untrusted data is not dynamically executed or unsafely deserialized.
- [sec-007](../checks/shared/sec/sec-007-password-storage-and-account-recovery.md) — Password storage and account recovery resist offline cracking and account takeover.
- [bp-sec-004](../checks/shared/sec/bp-sec-004-sensitive-data-not-emitted-to-logs-or-traces.md) — Sensitive data is not emitted to logs or traces.
- [sec-008](../checks/shared/sec/sec-008-public-responses-do-not-leak-secrets-or-internals.md) — Client-facing errors, URLs, and public responses do not leak secrets or internals.

### Reliability
- [bp-rel-001](../checks/shared/rel/bp-rel-001-outbound-dependencies-have-explicit-time-budgets.md) — Outbound dependencies have explicit time budgets.
- [bp-rel-002](../checks/shared/rel/bp-rel-002-retries-are-bounded-deliberate-and-safe.md) — Retries are bounded, deliberate, and safe for the operation.
- [rel-017](../checks/shared/rel/rel-017-side-effects-run-after-durable-commit.md) — Side effects and downstream jobs run only after durable commit.
- [rel-006](../checks/shared/rel/rel-006-retried-or-redelivered-work-is-idempotent-or-deduplicated.md) — Retried or redelivered work is idempotent or deduplicated.
- [rel-002](../checks/shared/rel/rel-002-downstream-work-propagates-cancellation-and-deadlines.md) — Downstream work propagates cancellation/deadlines and stops when callers are done.
- [rel-021](../checks/shared/rel/rel-021-security-sensitive-multi-step-operations-fail-closed-on-partial-failure.md) — Security-sensitive multi-step operations fail closed on partial failure.
- [rel-008](../checks/shared/rel/rel-008-overload-work-and-resource-consumption-are-bounded.md) — Overload-triggering work and resource consumption are bounded.
- [rel-014](../checks/shared/rel/rel-014-read-your-writes-paths-avoid-stale-async-replicas.md) — Read-your-writes paths avoid stale async replicas.
- [rel-001](../checks/shared/rel/rel-001-transient-resources-are-released-on-every-path.md) — Transient resources are released on every path.

### Architecture Core
- [arch-005](../checks/shared/arch-core/arch-005-module-owned-mutable-state-and-representations-stay-encapsulated.md) — Module-owned mutable state and representations stay encapsulated.
- [bp-arch-002](../checks/shared/arch-core/bp-arch-002-dependency-direction-follows-the-architecture-instead-of-bypassing-it.md) — Dependency direction follows the architecture instead of bypassing it.
- [arch-004](../checks/shared/arch-core/arch-004-runtime-work-starts-from-explicit-entrypoints.md) — Runtime work starts from explicit entrypoints instead of import/load side effects.
- [arch-002](../checks/shared/arch-core/arch-002-foreign-models-and-third-party-apis-are-translated-at-the-boundary.md) — Foreign models and third-party APIs are translated at the boundary.
- [bp-arch-001](../checks/shared/arch-core/bp-arch-001-modules-depend-through-explicit-reviewable-seams.md) — Modules depend through explicit, reviewable seams.
- [arch-003](../checks/shared/arch-core/arch-003-environment-and-configuration-are-read-modeled-and-validated-at-the-boundary.md) — Environment and configuration are read, modeled, and validated at the boundary.

### Testing
- [bp-test-001](../checks/shared/test/bp-test-001-behavior-changes-covered.md) — Behavior changes are protected by automated tests.
- [test-010](../checks/shared/test/test-010-explicit-simple-oracles.md) — Tests verify outcomes with explicit, simple oracles.
- [test-009](../checks/shared/test/test-009-outcome-assertions-over-interaction-only-mock-choreography.md) — Prefer outcome assertions over interaction-only mock choreography.
- [test-001](../checks/shared/test/test-001-boundary-and-compatibility-changes-have-executable-contract-coverage.md) — Boundary and compatibility changes have executable contract coverage.
- [bp-test-002](../checks/shared/test/bp-test-002-deterministic-tests.md) — Critical paths must have deterministic tests.
- [bp-test-003](../checks/shared/test/bp-test-003-default-tests-no-live-dependencies.md) — Default automated tests do not require live external dependencies.
- [test-008](../checks/shared/test/test-008-supported-interfaces-not-internals.md) — Tests assert behavior through supported interfaces, not internals.
- [test-003](../checks/shared/test/test-003-isolate-mutable-state-and-clean-up-resources.md) — Tests isolate mutable state and clean up created resources.

### Application Programming Interface
- [api-004](../checks/shared/api/api-004-retried-mutating-operations-idempotent-end-to-end.md) — Retried mutating operations are idempotent end-to-end.
- [api-001](../checks/shared/api/api-001-parse-translate-and-reject-input-at-boundary.md) — External API input is parsed, translated, and rejected at the boundary before side effects.
- [api-009](../checks/shared/api/api-009-published-api-contracts-backward-compatible.md) — Published API contracts remain backward compatible within a version.
- [bp-api-002](../checks/shared/api/bp-api-002-bounded-collection-reads.md) — Collection reads are bounded.
- [api-007](../checks/shared/api/api-007-mutable-resources-validators-and-preconditions.md) — Mutable resources expose validators and honor preconditions.
- [api-008](../checks/shared/api/api-008-contracts-published-and-in-sync.md) — Machine-readable API contracts stay published and in sync with implementation.
- [api-016](../checks/shared/api/api-016-large-json-identifiers-serialized-as-strings.md) — Potentially large JSON identifiers are serialized as strings.
- [bp-api-001](../checks/shared/api/bp-api-001-machine-readable-error-contracts.md) — External APIs return machine-readable error contracts.

### Data
- [data-011](../checks/shared/data/data-011-durable-state-mutations-are-atomic-rollback-safe-and-concurrency-correct.md) — Durable-state mutations are atomic, rollback-safe, and concurrency-correct.
- [data-027](../checks/shared/data/data-027-compute-derived-values-from-source-fields-instead-of-hand-maintaining-them.md) — Compute derived values from source fields instead of hand-maintaining them.
- [data-010](../checks/shared/data/data-010-versionable-formats-and-mixed-version-safe-evolution.md) — Durable or cross-process data uses versionable formats and mixed-version-safe evolution.
- [data-009](../checks/shared/data/data-009-forward-only-additive-schema-evolution.md) — Evolve deployed schemas with forward-only, additive-first compatibility changes.
- [data-001](../checks/shared/data/data-001-keep-training-and-evaluation-data-leakage-free.md) — Keep training and evaluation data leakage-free.
- [data-002](../checks/shared/data/data-002-validate-and-gate-upstream-data.md) — Validate and gate upstream data before downstream training or pipeline work.

### Operations
- [ops-022](../checks/shared/ops/ops-022-configuration-is-semantically-validated-before-apply.md) — Configuration is semantically validated before it is applied.
- [bp-ops-001](../checks/shared/ops/bp-ops-001-meaningful-health-signals.md) — Services expose meaningful health signals.
- [ops-024](../checks/shared/ops/ops-024-fails-safe-and-verifies-recovery.md) — Automation that changes production state fails safe and verifies recovery before restoring traffic.
- [ops-028](../checks/shared/ops/ops-028-production-defaults-disable-debug-demo-and-unnecessary-admin-surfaces.md) — Production defaults disable debug, demo, and unnecessary admin surfaces.
- [ops-003](../checks/shared/ops/ops-003-deployments-are-smoke-tested-before-success.md) — Deployments are smoke-tested before success.
- [ops-018](../checks/shared/ops/ops-018-cross-boundary-work-preserves-correlation-and-dependency-attribution.md) — Cross-boundary work preserves correlation and dependency attribution.
- [bp-ops-005](../checks/shared/ops/bp-ops-005-environment-agnostic-deployment-config.md) — Deployment config is environment-agnostic.
- [ops-017](../checks/shared/ops/ops-017-per-unit-production-telemetry-is-structured-and-complete.md) — Per-unit production telemetry is structured and complete.

### Performance
- [perf-004](../checks/shared/perf/perf-004-async-hot-paths-do-not-block-runtime-threads.md) — Async hot paths do not block runtime threads.
- [perf-001](../checks/shared/perf/perf-001-avoid-n-plus-one-data-access-in-hot-paths.md) — Avoid N+1 data access in hot paths.
- [perf-002](../checks/shared/perf/perf-002-avoid-accidental-quadratic-work-on-input-scaled-paths.md) — Avoid accidental quadratic work on input-scaled paths.
- [perf-003](../checks/shared/perf/perf-003-fetch-and-serialize-only-the-data-a-latency-sensitive-path-needs.md) — Fetch and serialize only the data a latency-sensitive path needs.
- [perf-010](../checks/shared/perf/perf-010-expose-latency-distributions-not-averages-alone.md) — Expose latency distributions, not averages alone.
- [perf-006](../checks/shared/perf/perf-006-version-internal-derived-caches-so-upgrades-rebuild-them.md) — Version internal derived caches so upgrades rebuild them.

### Documentation
- [doc-002](../checks/shared/doc/doc-002-docs-stay-in-sync-with-behavior-changes.md) — Public and operator-facing docs stay in sync with behavior changes.
- [doc-001](../checks/shared/doc/doc-001-public-apis-are-documented.md) — Externally consumed public APIs are documented.
- [doc-007](../checks/shared/doc/doc-007-public-releases-and-breaking-changes-are-documented-in-release-notes-or-changelogs.md) — Public releases and breaking changes are documented in release notes or changelogs.
