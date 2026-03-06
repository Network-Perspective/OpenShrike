# OpenShrike

Self-hosted, security-first agentic code reviewer and best-practice auditor.
Local and CI use, wrapping an agent runtime that can run tests, search the
codebase, and provide higher-level feedback on design, maintainability, and
process quality. Policies are authored as data and assembled into skills/bundles
so only the relevant checks are executed and reported. The system is meant to
close the loop by feeding structured results back into developer agents (Codex,
Claude Code, etc.) until checks are satisfied.

This repo now contains an MVP implementation of the OpenShrike CLI for
policy/check scanning via `opencode`, plus requirements and best-practice
definitions.

![logo](docs/openshrike-logo.png)

## Why this exists

As software development shifts to agent-driven workflows, we need observability
and governance over those agents. This project aims to:
- Detect higher-level code smells and architectural risks that linters miss.
- Enforce a growing library of best practices across the whole SDLC.
- Provide a secure, auditable execution environment for analysis agents.
- Create a feedback loop so agents can iteratively fix what is found.

## Guiding principles

- Security first: no secrets to agents; deterministic isolation for all CLI runs.
- Local-first and self-hosted: no vendor lock-in and no hidden outbound calls.
- Explainability: every finding has evidence, rationale, and remediation steps.
- Extensible best practices: policy-as-data assembled into skills/bundles.
- Observability: agent behavior is inspectable, traceable, and reproducible.

## Document map

- [Vision and scope](docs/requirements/01-project-vision.md)
- [Feature scope and phases](docs/requirements/02-feature-scope.md)
- [Security model](docs/requirements/03-security-model.md)
- [Agent runtime and isolation](docs/requirements/04-agent-runtime.md)
- [Best practices library](docs/requirements/05-best-practices-library.md)
- [Observability and feedback loop](docs/requirements/06-observability.md)
- [Workflows and integrations](docs/requirements/07-workflows-and-integrations.md)
- [MVP implementation: first C# check](docs/implementation/01-mvp-csharp-rel-001-implementation.md)
- [Fixture repo and pass/fail branches](docs/implementation/02-testscsharp-fixture-and-branches.md)

## Scan usage

Run exactly one of `--check` or `--policy`.

Run from repo root:

```bash
./shrike scan --policy csharp-baseline --repo .
```

Optional convenience to call `shrike` directly:

```bash
ln -sf "$(pwd)/shrike" ~/.local/bin/shrike
```

```bash
shrike scan --policy csharp-baseline --repo .
```

## Build and install

### Publish builds

Framework-dependent and self-contained builds:

```bash
scripts/publish.sh --mode both --rid linux-x64
```

Self-contained only:

```bash
scripts/publish.sh --mode self-contained --rid linux-x64
```

Framework-dependent only:

```bash
scripts/publish.sh --mode framework
```

Release layout:

```text
.artifacts/publish/
  framework/
    shrike
    app/
      OpenShrike.Cli.dll
      ...
  self-contained/
    linux-x64/
      shrike
      ...
```

### Install `shrike`

Install a self-contained binary to `~/.local/bin/shrike`:

```bash
scripts/install-local.sh \
  --source .artifacts/publish/self-contained/linux-x64/shrike
```

Use symlink mode for dev installs:

```bash
scripts/install-local.sh --source ./shrike --link
```

Upgrade:
1. Re-publish (`scripts/publish.sh ...`)
2. Re-run install (`scripts/install-local.sh ...`)

### Scope selection

Use `--scan-scope` to choose what to review. Supported values:
- `uncommitted` (default)
- `commit`
- `branch`
- `pr`
- `full`

Use `--scan-target` when required by scope:
- `commit`: commit hash or range (`HEAD~1..HEAD`)
- `branch`: base branch (`origin/main`)
- `pr`: optional diff spec (defaults to `origin/main...HEAD`)

Examples:

Uncommitted changes (default):
```bash
shrike scan \
  --policy csharp-baseline \
  --repo .
```

Commit/range scan:
```bash
shrike scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo . \
  --scan-scope commit \
  --scan-target HEAD~1..HEAD
```

Branch diff scan:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope branch \
  --scan-target origin/main
```

PR diff scan:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope pr \
  --scan-target origin/main...HEAD
```

Full repository scan:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope full
```

### Output options

Machine-readable JSON:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --output json
```

Human-readable Markdown:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --output markdown
```

Optional bundle emission:
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --emit-bundle artifacts/csharp-baseline.bundle.md
```

During execution, the CLI shows a Spectre.Console live dashboard on stderr: progress bar on top, colored `PASS/FAIL/UNKNOWN` counters below, and optional detailed check lists. Toggle details with `d`, `Ctrl+T`, or `Ctrl+O` (terminal-dependent). JSON/Markdown reports stay on stdout.

Mock mode for progress/UI testing (no external `opencode` dependency):
```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope full \
  --mock-opencode
```

In mock mode each check takes ~2-5 seconds and returns `pass` with ~90% probability.

## Recent changes

- Added policy scanning via `--policy` with markdown policy resolution.
- Added policy/check bundle assembly output via `--emit-bundle`.
- Added scan scope control: `--scan-scope` and `--scan-target`.
- Default scope is now `uncommitted`.
- Added full repo scan support via `--scan-scope full`.
- Added markdown report output via `--output markdown` (JSON remains available).
- Added read-only guardrail that fails a run if the agent mutates repository files.
- Added publish/install scripts for framework-dependent and self-contained binaries.
- Added Spectre.Console progress output for long-running scans.
