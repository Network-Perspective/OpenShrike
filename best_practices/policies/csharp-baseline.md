# C# Baseline Policy (Draft)

This policy defines a full C# review bundle by **including shared domain
checks** and **adding C#-specific checks**. It is designed to be assembled into
a single opencode skill for efficient, diff-aware reviews.

## Policy metadata
- Policy ID: `csharp-baseline`
- Scope: C#/.NET repositories (ASP.NET Core, libraries, services)
- Mode: Diff-first with optional full-repo expansion for high-risk checks

## Included shared domain bundles
These are references to cross-language check groups (no duplication):
- ARCH baseline
- TEST baseline
- SEC baseline
- REL baseline
- PERF baseline
- OPS baseline
- DOC baseline
- DATA baseline
- API baseline
- CI baseline
- SUPPLY baseline
- DX baseline

## C#-specific checks (added by this policy)

### C#-ARCH
- No circular project/assembly references (must be acyclic at build time).
- Public APIs follow analyzer naming/visibility rules.
- DI container registrations validated at startup.
- Configuration uses strongly-typed `IOptions<T>` patterns.

### C#-TEST
- Async tests avoid `Task.Result` / `.Wait()` deadlocks.
- Tests use deterministic time via fakes or clocks.
- Avoid static mutable state in tests.
- Snapshot tests for large JSON outputs use approval workflows.

### C#-SEC
- `HttpClient` managed via `IHttpClientFactory`.
- No untrusted input in `ProcessStartInfo` without strict validation.
- Avoid `BinaryFormatter` and insecure deserialization APIs.
- Policy-based authorization attributes used consistently.
- Crypto uses `System.Security.Cryptography` with approved algorithms.

### C#-REL
- `CancellationToken` threaded through async call chains.
- Configure awaits consistent for libraries vs apps.
- Resilience policies (retry/circuit-breaker) for outbound calls.

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

## Check documents (for agent instructions)
Each check is defined with step-by-step guidance and pass/fail examples:
- `best_practices/checks/csharp/csharp-arch-001-no-circular-references.md`
- `best_practices/checks/csharp/csharp-arch-002-public-api-analyzers.md`
- `best_practices/checks/csharp/csharp-arch-003-di-registrations-validated.md`
- `best_practices/checks/csharp/csharp-arch-004-typed-options.md`
- `best_practices/checks/csharp/csharp-test-001-avoid-task-result.md`
- `best_practices/checks/csharp/csharp-test-002-deterministic-time.md`
- `best_practices/checks/csharp/csharp-test-003-no-static-mutable-test-state.md`
- `best_practices/checks/csharp/csharp-test-004-json-snapshot-approvals.md`
- `best_practices/checks/csharp/csharp-sec-001-httpclient-factory.md`
- `best_practices/checks/csharp/csharp-sec-002-processstartinfo-validation.md`
- `best_practices/checks/csharp/csharp-sec-003-no-binaryformatter.md`
- `best_practices/checks/csharp/csharp-sec-004-policy-authorization.md`
- `best_practices/checks/csharp/csharp-sec-005-approved-crypto.md`
- `best_practices/checks/csharp/csharp-rel-001-cancellation-tokens.md`
- `best_practices/checks/csharp/csharp-rel-002-configureawait-consistency.md`
- `best_practices/checks/csharp/csharp-rel-003-resilience-policies.md`
- `best_practices/checks/csharp/csharp-perf-001-avoid-boxing.md`
- `best_practices/checks/csharp/csharp-perf-002-valuetask-usage.md`
- `best_practices/checks/csharp/csharp-perf-003-avoid-linq-allocations.md`
- `best_practices/checks/csharp/csharp-ops-001-health-checks.md`
- `best_practices/checks/csharp/csharp-ops-002-structured-logging.md`
- `best_practices/checks/csharp/csharp-ops-003-no-secrets-in-appsettings.md`
- `best_practices/checks/csharp/csharp-ops-004-dotnet-container-minimal.md`
- `best_practices/checks/csharp/csharp-doc-001-xml-docs-public-apis.md`
- `best_practices/checks/csharp/csharp-doc-002-release-notes-breaking.md`

## Overrides (draft)
- Allow disabling any check with explicit rationale and expiry.
- Allow severity overrides for early adoption.

## Output contract
Each check must emit:
- `id`, `version`, `status`, `confidence`
- `evidence` (paths/refs)
- `rationale` and `remediation`
