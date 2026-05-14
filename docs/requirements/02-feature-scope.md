# Feature Scope and Phases

## Core features (MVP)
- Policy-driven review engine that evaluates code and artifacts.
- Wrapper around an agent runtime with isolated CLI execution.
- Findings output in human-readable and machine-readable formats.
- Local and CI-friendly CLI interface.
- Best-practices library with a small, curated baseline set.
- Policy assembler that turns selected checks into skills/bundles.
- Local OpenCode agent configuration for lightweight guardrails (readonly code access + necessary tooling)

## Phase 2 features
- Isolated docker runtime
- Multi-agent review: parallel reviewers to speed up execution
- Interactive scan actions for recheck and single-check fix
- Sequential batch fixing via `shrike fix`
- Saved last-scan state for resume/recheck/fix flows

## Phase 3 features
- Policy marketplace and sharing via repositories.
- Interactive "reviewer coach" for live iteration with agents.
- Organization-level governance dashboards and compliance reporting.
- Cross-repo insights about recurring debt patterns.

## Out of scope (for now)
- Cloud-hosted inference or unattended automated code changes without an
  explicit operator action such as `Fix` in the UI or `shrike fix`.
- Direct access to production credentials or deployments.

## Key feature descriptions

### Policy-driven review engine
Policies encode best practices as structured checks with evidence requirements,
applicability rules, and remediation guidance.

### Policy assembler (skills/bundles)
Selected checks are assembled into an execution bundle (opencode skill) so the
agent sees only the needed instructions, reducing context bloat and token cost.

### Agent runtime (secure)
Agents can run CLI commands, but only in isolated environments with no access to
secrets or external network unless explicitly allowed.
The runtime is expected to be a wrapper over an existing agent system.

### Structured output
Findings are serialized into structured JSON for human review, external
consumption by agents (Codex, Claude Code, etc.), and Shrike's own saved-state
resume/recheck/fix workflows.
Shrike also writes a human-readable Markdown snapshot of the latest saved scan
state for local review.

### Feedback loop iteration (Phase 2)
Support "iterate until clean" workflows where Shrike can recheck or fix one
selected finding at a time, and where external agents can still consume
exported findings if needed. See
`docs/requirements/08-interactive-fix-loop-and-last-scan.md`.
