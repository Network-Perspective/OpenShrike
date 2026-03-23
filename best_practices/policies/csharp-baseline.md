# C# Baseline Policy

This is the default high-signal policy for .NET pull request review. It is
intended for mature C# codebases: services, background workers, web APIs,
libraries, and shared internal platforms.

The policy is intentionally curated. It favors rules that catch real defects
and design regressions in ordinary review. It does not try to enforce every
possible good idea.

## Policy metadata

- Policy ID: `csharp-baseline`
- Scope: C#/.NET repositories
- Review mode: diff-first, with repo expansion when a check requires structural
  evidence
- Expected bar: a PR that passes this policy should look production-ready,
  reviewable, and operationally responsible

## Review contract

When executing this policy:

- Fail only on direct evidence.
- Use `unknown` when the rule is not applicable or the diff is too small to
  establish the missing safeguard.
- Do not fail a PR for micro-optimization preferences or public-package
  obligations that clearly do not apply.

## Included checks

### Architecture

- [csharp-arch-001-no-circular-references](../checks/csharp/csharp-arch-001-no-circular-references.md)
- [csharp-arch-003-di-registrations-validated](../checks/csharp/csharp-arch-003-di-registrations-validated.md)
- [csharp-arch-004-typed-options](../checks/csharp/csharp-arch-004-typed-options.md)
- [csharp-arch-005-no-service-locator](../checks/csharp/csharp-arch-005-no-service-locator.md)

### Testing

- [csharp-test-001-avoid-task-result](../checks/csharp/csharp-test-001-avoid-task-result.md)
- [csharp-test-002-deterministic-time](../checks/csharp/csharp-test-002-deterministic-time.md)
- [csharp-test-003-no-static-mutable-test-state](../checks/csharp/csharp-test-003-no-static-mutable-test-state.md)
- [csharp-test-005-changed-behavior-covered](../checks/csharp/csharp-test-005-changed-behavior-covered.md)
- [csharp-test-006-no-live-network-in-tests](../checks/csharp/csharp-test-006-no-live-network-in-tests.md)

### Security

- [csharp-sec-001-httpclient-factory](../checks/csharp/csharp-sec-001-httpclient-factory.md)
- [csharp-sec-002-processstartinfo-validation](../checks/csharp/csharp-sec-002-processstartinfo-validation.md)
- [csharp-sec-003-no-binaryformatter](../checks/csharp/csharp-sec-003-no-binaryformatter.md)
- [csharp-sec-004-policy-authorization](../checks/csharp/csharp-sec-004-policy-authorization.md)
- [csharp-sec-005-approved-crypto](../checks/csharp/csharp-sec-005-approved-crypto.md)
- [csharp-sec-006-parameterized-data-access](../checks/csharp/csharp-sec-006-parameterized-data-access.md)
- [csharp-sec-007-no-sensitive-data-in-logs](../checks/csharp/csharp-sec-007-no-sensitive-data-in-logs.md)

### Reliability

- [csharp-rel-001-cancellation-tokens](../checks/csharp/csharp-rel-001-cancellation-tokens.md)
- [csharp-rel-003-resilience-policies](../checks/csharp/csharp-rel-003-resilience-policies.md)
- [csharp-rel-004-explicit-timeouts](../checks/csharp/csharp-rel-004-explicit-timeouts.md)
- [csharp-rel-005-background-services-honor-cancellation](../checks/csharp/csharp-rel-005-background-services-honor-cancellation.md)

### Operations

- [csharp-ops-001-health-checks](../checks/csharp/csharp-ops-001-health-checks.md)
- [csharp-ops-002-structured-logging](../checks/csharp/csharp-ops-002-structured-logging.md)
- [csharp-ops-003-no-secrets-in-appsettings](../checks/csharp/csharp-ops-003-no-secrets-in-appsettings.md)
- [csharp-ops-004-dotnet-container-minimal](../checks/csharp/csharp-ops-004-dotnet-container-minimal.md)
- [csharp-ops-005-safe-startup-migrations](../checks/csharp/csharp-ops-005-safe-startup-migrations.md)

### API design

- [csharp-api-001-request-validation](../checks/csharp/csharp-api-001-request-validation.md)
- [csharp-api-002-problem-details-errors](../checks/csharp/csharp-api-002-problem-details-errors.md)
- [csharp-api-003-pagination-for-unbounded-collections](../checks/csharp/csharp-api-003-pagination-for-unbounded-collections.md)

## Checks intentionally excluded from the baseline

The library contains additional checks that are useful in specific contexts but
too situational or too noisy for the default policy:

- `csharp-arch-002-public-api-analyzers`
- `csharp-test-004-json-snapshot-approvals`
- `csharp-rel-002-configureawait-consistency`
- `csharp-perf-001-avoid-boxing`
- `csharp-perf-002-valuetask-usage`
- `csharp-perf-003-avoid-linq-allocations`
- `csharp-doc-001-xml-docs-public-apis`
- `csharp-doc-002-release-notes-breaking`

Those remain part of the library and can be enabled by stricter or
context-specific policies later.

## Override guidance

- Allow a check override only with a clear rationale tied to the code change.
- Record the intended expiry for temporary overrides.
- Do not downgrade a failing high-confidence security or reliability check
  without a compensating control.

## Output contract

Each check must emit:

- `id`
- `version`
- `status`
- `confidence`
- `evidence`
- `rationale`
- `remediation`
