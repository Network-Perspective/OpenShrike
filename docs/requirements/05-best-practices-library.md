# Best Practices Library

## Purpose
The library is a versioned, auditable collection of best-practice checks that
span code, tests, documentation, and delivery workflows.

Checks are individually versioned and can be enabled/disabled or overridden
independently. Policies select checks, and the assembler bundles them into
opencode skills to keep context small and runtime efficient.

## Structure of a best-practice entry (example shape)
- ID and title
- Scope and applicability rules
- Strategy hint: `static`, `heuristic`, or `reasoning` (see below)
- Evidence required (files, tests, metrics)
- Risk level and rationale
- Remediation guidance
- Confidence guidance (HIGH / MEDIUM / LOW — see below)
- References and provenance
- Output contract (status + confidence + evidence summary)

## Strategy hints
Each check declares an execution strategy hint:
- **static**: Resolvable with grep, AST analysis, or embedded CLI commands.
  The skill should include the concrete commands to run.
- **heuristic**: Needs structured queries with some judgment (e.g., dependency
  graph analysis, coverage gap detection).
- **reasoning**: Genuinely needs LLM evaluation (e.g., ADR completeness,
  API design quality).

For MVP, all checks run through opencode regardless of strategy. The hint
informs future optimization — static checks can be extracted to fast,
deterministic tooling without rearchitecting.

## Confidence levels
Checks must report confidence as one of three levels (not a numeric score):
- **HIGH**: Found direct evidence (code match, failing test, config value).
- **MEDIUM**: Found indirect evidence (pattern match, missing expected structure).
- **LOW**: Inference only (no direct evidence, based on absence or heuristics).

Checks should include a `## Confidence guidance` section that tells the agent
when to assign each level for that specific check.

## Policy assembler (skills/bundles)
Policies declare which checks are enabled, their versions, and any overrides.
The assembler converts that policy into an opencode skill definition that:
- Includes only the selected checks to minimize context.
- Defines shared setup steps and reusable evidence collection.
- Emits a structured report with per-check status and confidence.

The assembler is a straightforward script that selects applicable checks,
formats them into the opencode skill format, and filters out disabled or
inapplicable checks. It is not a traditional compiler — it performs selection
and template assembly, not transformation or optimization.

Inputs:
- Policy file (enabled checks, versions, overrides).
- Repo context (diff scope, language hints, config toggles).
- Runtime capabilities (tools allowlist, deployment tier).

Outputs:
- Opencode skill definition (instructions + check list).
- Machine-readable report schema for findings.

Config toggles (examples):
- Enable/disable individual checks.
- Change check severity or confidence thresholds.
- Choose diff-only vs full-repo evaluation.
- Select execution backend (containerized or CI-provided sandbox).

## Sample best-practice entries (initial set)

### BP-ARCH-001: Avoid hidden cross-module dependencies
Risk: Hidden dependencies make refactors dangerous and increase build times.
Evidence: Dependency graph shows module A importing module B without an explicit
API boundary or ownership policy.
Remediation: Introduce a public interface or remove the implicit coupling.

### BP-TEST-002: Critical paths must have deterministic tests
Risk: Flaky or missing tests reduce trust in automated reviews.
Evidence: High-churn paths lack stable tests or have a high flake rate.
Remediation: Add deterministic tests and quarantine flake-prone ones.

### BP-SEC-003: No privileged commands in review context
Risk: Elevated commands can mutate the host or expose secrets.
Evidence: Agent command log includes sudo or privileged containers.
Remediation: Restrict command allowlist and run in rootless containers.

### BP-DOC-004: Architectural decisions are recorded
Risk: Untracked design changes lead to inconsistent implementation.
Evidence: Significant code changes without corresponding decision record.
Remediation: Add or update an ADR describing the decision.

### BP-OPS-005: Deployment config is environment-agnostic
Risk: Environment-specific values create drift and production surprises.
Evidence: Hard-coded environment values found in deployment manifests.
Remediation: Move values to environment configuration or secrets management.

## Check authoring and testing workflow
- Write a check as a markdown file with step-by-step evaluation, pass/fail
  examples, confidence guidance, and strategy hint.
- Create or identify test fixtures: a known-good repo/snippet and a known-bad
  repo/snippet for the check.
- Run the check in isolation against both fixtures using the CLI:
  `shrike scan --check <check-id> --path ./test-fixtures/<fixture>`
- Verify the output JSON: the check should pass on the good fixture and fail
  on the bad fixture with appropriate confidence and evidence.
- For static-strategy checks, verify that the embedded CLI commands produce
  the expected results independently of the LLM.
- Only add the check to a policy after it passes the fixture validation.

## Library growth model
- Policies live in versioned repositories and can be customized per org.
- Each entry includes provenance (author, source, date, references).
- Deprecations are tracked to avoid breaking past reports.
- Bundles aggregate checks for execution, but checks remain the unit of policy.
