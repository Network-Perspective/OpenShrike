# Best Practices Library

This library is a versioned set of review checks intended for automated,
diff-aware software design review. Its purpose is not to enforce house style.
Its purpose is to catch changes that make systems less safe, less maintainable,
less observable, or less reliable.

The standard for a baseline policy is high: if a pull request passes the
baseline, a strong engineer should be able to say the change looks deliberate,
operable, testable, and respectful of architectural boundaries.

## Design goals

- Prefer checks that correlate with real production failures, security issues,
  or long-term maintenance pain.
- Minimize false positives by requiring explicit applicability rules and direct
  evidence.
- Keep checks independent so they can be versioned, enabled, disabled, or
  overridden one at a time.
- Bias toward `unknown` instead of `fail` when evidence is weak or the rule is
  not applicable to the code under review.
- Keep baseline policies curated. A baseline is not a dumping ground for every
  check the library knows how to express.

## Non-goals

The baseline library should not fail a PR for:

- Formatting preferences already handled by linters or analyzers.
- Framework fashion or tool choice without a clear engineering risk.
- Micro-optimizations without evidence that the code is on a hot path.
- Documentation requirements that only make sense for public packages when the
  code is an internal service.
- Architecture opinions that cannot be supported with repository evidence.

## Signal rubric

Every check in this library should satisfy all of the following.

### 1. Applicability comes first

A check must say when it applies and when it does not.

Examples:

- Container rules do not apply to repos that do not build container images.
- Public API governance rules do not apply to internal services with no
  external consumers.
- Hot-path performance rules do not apply unless the changed code is clearly in
  a hot path or the PR itself claims a performance goal.

If applicability cannot be established, the correct result is usually
`unknown`, not `fail`.

### 2. Fail only on direct evidence

A fail should usually be grounded in one of:

- A dangerous API usage.
- Missing protection around an obvious risky path.
- A concrete architectural violation.
- A changed public contract without matching safeguards.
- A production-facing configuration or operational gap.

Absence-based reasoning is allowed only when the repository strongly implies a
required control should exist and it clearly does not.

### 3. Keep remediation local and actionable

The best checks produce findings with short remediations:

- add validation at the boundary,
- pass the cancellation token,
- use parameterized SQL,
- move service resolution to the composition root,
- add a timeout or policy,
- add or update tests for the changed behavior.

If remediation is vague, the check is probably too vague.

### 4. Prefer important rules over numerous rules

A smaller set of strong checks is better than a large set of noisy checks.
Policies should include only checks that are useful in routine PR review.
Situational or low-confidence checks should exist in the library, but should
not be part of the default baseline.

### 5. Preserve the `pass` / `fail` / `unknown` contract

- `pass`: direct evidence shows the code satisfies the check.
- `fail`: direct evidence shows the code violates the check.
- `unknown`: the rule does not apply, or the available evidence is not strong
  enough to justify a fail.

## Strategy hints

Checks declare one of three strategy hints:

- `static`: a deterministic pattern or repository query should be enough.
- `heuristic`: a structured search plus judgment is needed.
- `reasoning`: the check depends on software design judgment.

For the current MVP, all checks still run through the agent. The strategy hint
exists to keep the library ready for future extraction into faster tooling.

## Required shape of a check

Each check should define:

- ID and title.
- Intent.
- Applicability, including when to return `unknown`.
- Strategy hint.
- What to inspect.
- Pass criteria.
- Fail criteria.
- Explicit false-positive guards (`Do not flag`).
- Evidence expectations.
- Confidence guidance.
- Remediation guidance.
- Pass and fail examples.

## Confidence guidance

Confidence is about evidence quality, not severity.

- `HIGH`: the violation or pass condition is directly visible in code,
  configuration, tests, or build artifacts.
- `MEDIUM`: the conclusion is strong but partly inferred from surrounding code.
- `LOW`: applicability or evidence is weak; use only when `unknown` is not
  appropriate.

The check author should explain what counts as `HIGH`, `MEDIUM`, and `LOW` for
that specific rule.

## Policy design

Policies are curated bundles of checks. A good policy:

- Includes only checks strong enough for routine use.
- Mixes architecture, security, reliability, testing, API quality, and
  operations.
- Avoids duplicating generic domain intent across language variants.
- Documents which checks are intentionally excluded from baseline because they
  are situational or noisy.

The current `csharp-baseline` policy should be interpreted as:

- strict on correctness, security, architecture, and operability,
- conservative on style and micro-performance,
- willing to say `unknown` when the diff does not establish applicability.

## Domain model

The library is organized by engineering concern first, language second.

- `ARCH`: architecture and dependency boundaries.
- `TEST`: tests, determinism, and reviewable behavioral safety.
- `SEC`: security controls, dangerous APIs, and sensitive data handling.
- `REL`: resilience, cancellation, timeouts, retries, and safe background work.
- `PERF`: performance-sensitive patterns only when a hot path is evident.
- `OPS`: deployability, observability, container and runtime safety.
- `API`: public contract design and external input handling.
- `DATA`: persistence, privacy, schema safety, and data-shaping concerns.
- `DOC`: public-facing documentation obligations.

## C# library stance

The C# library should focus on checks that a strong .NET reviewer would expect
to matter in production:

- dependency direction and composition-root hygiene,
- validated configuration and startup safety,
- secure outbound and inbound I/O,
- cancellation, time budgets, and retry discipline,
- hermetic and behavior-covering tests,
- stable API behavior at boundaries,
- operational readiness and secret hygiene.

The library should not make the default baseline fail on:

- `ValueTask` not being used,
- LINQ being present in ordinary business code,
- XML comments missing from internal service code,
- `ConfigureAwait(false)` not being used in ASP.NET Core app code.

Those checks may still exist in the library, but only as opt-in or
context-specific guidance.

## Authoring rules for new checks

Before adding a new check, the author should be able to answer all of these:

1. What concrete production or maintenance failure does this prevent?
2. Can a reviewer usually identify a violation from repository evidence?
3. When should the agent return `unknown` instead of `fail`?
4. What are the common false positives, and how does the check avoid them?
5. Would a strong team be proud to require this rule in most PRs?

If the answer to any of these is weak, the check should probably stay out of
the baseline.

## Check growth model

- Keep checks individually versioned and independently overridable.
- Add new checks only after validating them on known-good and known-bad
  fixtures.
- Prefer refining an existing check over adding a near-duplicate.
- Deprecate low-signal checks rather than silently letting them drift.
- Treat policy quality as a product decision, not a documentation exercise.

## Output contract

Each executed check must emit:

- `id`
- `version`
- `status`
- `confidence`
- `evidence`
- `rationale`
- `remediation`

The contract is intentionally small. Precision must come from the check
definition, not from a bloated result schema.
