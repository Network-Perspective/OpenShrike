# Best Practices Library (Draft)

This document is a brainstorming map of checks the tool could provide. It is
intentionally extensive to shape the eventual best-practice (BP) structure.

## Organizing principles (draft)

### How to group
- Primary axis: **domain/area** (ARCH, TEST, SEC, OPS, DOC, PERF, REL, DATA).
- Secondary axis: **language/framework** (language-specific variants of checks).

Rationale:
- Most best practices are domain-driven and cross-language.
- Language/framework variants often share intent but differ in evidence
  collection or remediation steps.
  - Language-specific bundles should *reference* shared domain checks rather
    than duplicating them, and only add truly language-specific checks.

### Granularity
- **Isolate each check** so it can be enabled, versioned, and overridden
  independently.
- **Group-level bundles** assemble multiple checks into one execution plan to
  reduce token cost and shared setup overhead.

### Bundles and reporting
- Bundles should emit structured output listing each check's status and
  confidence (pass/fail/unknown + confidence score).
- Bundles can share setup steps (checkout, dependency install, indexing) once
  per run and reuse evidence across many checks.
  - Language-specific bundles should include shared domain checks by reference
    (or import) to avoid duplication and drift.

### Group-level tools/scripts
Yes, but only when needed:
- Some groups benefit from shared evidence tooling (dependency graphs, coverage
  analysis, infra scanning).
- Prefer reusable tools per group (e.g., `arch-tools`, `sec-tools`) with strict
  allowlists and clear outputs.
- Avoid monolithic "do everything" scripts to keep isolation predictable.

## Check catalog (brainstorm)

### ARCH (Architecture)
- No hidden cross-module dependencies.
- Public interface boundaries are explicit and documented.
- Dependency direction follows layering rules.
- Cyclic dependencies are absent or isolated.
- Modules have clear ownership boundaries.
- High-churn modules have stable APIs.
- Configurations are not mixed with business logic.
- Feature flags have expiry or cleanup plan.
- Cross-cutting concerns (auth, logging) are centralized.
- Domain boundaries map to folder structure and imports.

### TEST (Testing & Quality)
- Critical paths have deterministic tests.
- Flaky tests are quarantined or tagged.
- Coverage thresholds for critical modules.
- Integration tests cover core flows.
- Golden tests are used for outputs with complex formatting.
- Snapshot tests are reviewed for relevance.
- Test data is realistic and minimal.
- Tests do not rely on external network by default.
- No skipped tests in mainline.
- Performance tests exist for latency-sensitive paths.

### SEC (Security)
- No privileged commands in review context.
- Secret scanning: no tokens, keys, or passwords in repo.
- Input validation for external inputs.
- Safe deserialization practices.
- SSRF and file path traversal protections.
- SQL injection protections via parameterization.
- Output encoding for HTML/JS contexts.
- Cryptography uses vetted libraries, not custom code.
- Authz checks exist for every protected route.
- Session handling is secure and consistent.

### REL (Reliability & Resilience)
- Retries use bounded backoff and jitter.
- Timeouts exist for all remote calls.
- Circuit breakers for unstable dependencies.
- Graceful degradation for non-critical failures.
- Idempotency for write operations (where needed).
- Error handling uses typed, contextual errors.
- No infinite loops or unbounded retries.
- Service dependencies have health checks.
- Background jobs have retry limits and DLQs.
- Feature rollout includes rollback plan.

### PERF (Performance)
- N+1 query patterns are avoided.
- Hot paths have baseline benchmarks.
- Caching strategy is explicit and invalidation-safe.
- Heavy computations are offloaded or batched.
- Avoid unnecessary serialization/deserialization.
- Large file processing is streaming not buffering.
- Client payload sizes are bounded.
- Pagination for large list endpoints.
- Async I/O used for blocking external calls.

### OPS (Operations & Deployability)
- Deployment config is environment-agnostic.
- No hard-coded environment values in manifests.
- Rollback is supported and documented.
- Observability (logs/metrics/traces) for critical paths.
- Rate limits for public endpoints.
- Log levels are consistent and structured.
- Feature flags used for risky launches.
- Container images are minimal and pinned.
- Startup checks validate required env vars.
- Database migrations are reversible or documented.

### DOC (Documentation & Process)
- Architectural decisions are recorded (ADRs).
- Public APIs have versioning guidance.
- Runbooks exist for critical services.
- Onboarding docs are current.
- Code comments explain non-obvious constraints.
- Security decisions and exceptions are documented.
- "How to test" is documented for major modules.
- Release notes for breaking changes.

### DATA (Data & Privacy)
- PII is classified and handled explicitly.
- Data retention policies are enforced.
- Data migrations include backfill plan.
- Data schemas are versioned.
- Audit logging for sensitive data access.
- Exported data is sanitized or redacted.
- Least-privilege database roles are used.
- Backups and restore procedures are tested.

### API (API Design)
- Request/response schemas are validated.
- Backward compatibility checks for public APIs.
- Error responses are standardized.
- Pagination and filtering are consistent.
- Rate limiting and quotas are documented.
- Idempotency keys for mutating endpoints.

### CI (Pipeline & Build)
- Reproducible builds with locked dependencies.
- CI does not run with elevated privileges.
- All checks run on PR before merge.
- Build artifacts are signed or checksummed.
- Dependency updates are automated and reviewed.
- Linting gates are enforced.
- Tests are parallelized but deterministic.

### SUPPLY (Supply Chain)
- Dependencies are pinned and verified.
- SBOM is generated for releases.
- License compliance is checked.
- Vulnerability scanning for dependencies.
- Third-party code provenance is recorded.

### DX (Developer Experience)
- Clear error messages for failed validation.
- Configuration is discoverable and documented.
- Default policies are safe and low-friction.
- False positives are explainable and suppressible.

## C#-specific checks (initial focus)
Note: The C# bundle should *include* shared domain checks and add only checks
that are truly C#-specific. No duplication of generic checks across bundles.

### C#-ARCH
- Assemblies avoid circular references.
- Public APIs follow analyzers' naming and visibility guidance.
- DI container registrations are validated at startup.
- Configuration options use strongly-typed `IOptions<T>` patterns.

### C#-TEST
- Async tests avoid `Task.Result` or `.Wait()` deadlocks.
- Tests use deterministic time via fakes or clocks.
- Avoid static mutable state in tests.
- Snapshot tests are used for large JSON outputs with approval workflows.

### C#-SEC
- `HttpClient` is managed via `IHttpClientFactory`.
- No untrusted input in `ProcessStartInfo` without strict validation.
- Avoid `BinaryFormatter` and insecure deserialization APIs.
- Authorization checks use policy-based attributes consistently.
- Crypto uses `System.Security.Cryptography` with approved algorithms.

### C#-REL
- `CancellationToken` is threaded through async call chains.
- Configure awaits are consistent and appropriate for libraries vs apps.
- Resilience policies (retry/circuit-breaker) exist for outbound calls.

### C#-PERF
- Avoid boxing in hot paths; use generics or `Span<T>`.
- Prefer `ValueTask` for high-frequency async where appropriate.
- Avoid excessive allocations in LINQ-heavy loops.

### C#-OPS
- Health checks registered for dependencies.
- Structured logging with scopes and correlation IDs.
- `appsettings.*.json` does not contain secrets.
- Minimal container images and multi-stage builds for .NET apps.

### C#-DOC
- Public APIs documented with XML comments and generated docs.
- Breaking changes captured in release notes.

## Open questions (to decide structure)
- Should domain groups be first-class with shared tools?
- Should language-specific variants live under each group or as overlays?
- How do we version group bundles versus single checks?
