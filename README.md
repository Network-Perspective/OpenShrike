![OpenShrike logo](docs/openshrike-logo.png)

<div align="center">
  <a href="https://network-perspective.github.io/OpenShrike/"><img src="https://img.shields.io/badge/Website-OpenShrike-20B2AA?style=for-the-badge&logo=githubpages&logoColor=white" alt="Website"></a>
  <a href="https://discord.gg/4MKThAVsy2"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/Network-Perspective/OpenShrike/releases/latest"><img src="https://img.shields.io/github/v/release/Network-Perspective/OpenShrike?style=for-the-badge&color=20B2AA" alt="Latest release"></a>
  <a href="https://github.com/Network-Perspective/OpenShrike/actions/workflows/release-bundles.yml"><img src="https://img.shields.io/github/actions/workflow/status/Network-Perspective/OpenShrike/release-bundles.yml?style=for-the-badge&label=build" alt="Build status"></a>
  <a href="https://github.com/OpenHands/OpenHands/blob/main/LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-20B2AA?style=for-the-badge" alt="MIT License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 22+"></a>
  

  <!-- Keep these links. Translations will automatically update with the README. -->
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=de">Deutsch</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=es">Español</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=fr">français</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=ja">日本語</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=ko">한국어</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=pt">Português</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=ru">Русский</a> | 
  <a href="https://www.readme-i18n.com/Network-Perspective/OpenShrike?lang=zh">中文</a>
</div>

## Turn engineering best practices into automated, predictable code reviews.  

Code generation is cheap. Code review is the new bottleneck. LLMs produce pull
requests in minutes; reviewing them thoroughly still takes hours. Teams either
drown in review or switch to YOLO mode — and existing tooling does not close
the gap. Linters catch syntax. Unit tests check behavior. OpenShrike goal is
systematicall verify that a change follows the architectural decisions,
security practices, and engineering standards set by your team.

OpenShrike is a security-first, self-hosted code review tool that fills that
gap. Your standards live in the repo as versioned Markdown checks and policies
in [best_practices/](best_practices/). `shrike init` seeds the selected policy
into repo-local Markdown under `.openshrike/checks/`, so the checks that
actually run can be reviewed in code review and edited or extended by
maintainers. OpenShrike then executes those project-local checks with OpenCode
and produces findings with evidence, rationale, and remediation — locally or
in CI, against the LLM provider of your choice.

![scan screenshot](docs/scan-screenshot.png)

## Why OpenShrike

- **Predictable checks.** You know exactly what is verified on every PR, not
  whatever a free-form `/review` prompt decided to look at this time.
- **Requirements as Markdown.** Standards live in the repo, versioned and
  reviewable — no proprietary DSL, no external dashboard.
- **Beyond linters and tests.** Enforce architectural boundaries, test
  discipline, boundary validation, secret hygiene, timeouts and cancellation,
  observability, and API safety.
- **Auto-fix with agents.** `shrike fix` spawns an agent to repair failing
  checks before a PR reaches a human reviewer.
- **BYOK.** Bring your own key and model — OpenAI, Anthropic, Bedrock, Azure,
  Ollama, LMStudio, and anything else OpenCode supports.
- **Self-hosted.** Runs locally or in CI with `native` and `docker` runtimes.
  Your code does not leave your infrastructure.

## Install

Prerequisite: [Node.js 22+](https://nodejs.org/en/download).

Install the latest GitHub release:

```bash
curl -fsSL https://raw.githubusercontent.com/Network-Perspective/OpenShrike/main/install | bash
```

On Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Network-Perspective/OpenShrike/main/install.ps1 | iex
```


## Simple workflow

Assume `shrike` is on your `PATH`. If you are running directly from this
repository, use `./shrike` instead.

```bash
shrike init
shrike scan
```

- `shrike init` is interactive. It detects the project, helps establish
  AI provider access, lets you choose defaults, and writes
  `.openshrike/project.json`, `.openshrike/opencode.json`, and seeds
  `.openshrike/checks/`.
- `shrike scan` uses those saved defaults automatically and reads the
  Markdown checks from `.openshrike/checks/`. By default it scans
  uncommitted changes in the current repository.
- Re-run `shrike init` when you want to seed checks from a different policy
  or change saved model, runtime mode, or parallelism defaults.

## Install From Source

Prerequisite: [Node.js 22+](https://nodejs.org/en/download).

```bash
npm install
npm run build
scripts/install-local.sh --source ./shrike --link
```

If `~/.local/bin` is not on your `PATH`, add it in your shell profile.
`shrike init` expects an interactive terminal.

## What Gets Tested

OpenShrike policies are bundles of checks for things like:

- architecture and dependency boundaries,
- behavior-covering and deterministic tests,
- boundary validation and secret hygiene,
- time budgets, retries, and cancellation,
- deployability, health signals, and observability,
- API and data-shaping safety.

The bundled library is documented in
[best_practices/README.md](best_practices/README.md). The goal is not to
duplicate linters. The goal is to enforce the practices that actually keep
systems safe, maintainable, observable, and reliable.

## Command Reference

### `shrike init`

Interactive setup for the local `.openshrike/` directory.

```bash
shrike init [--force]
```

- `--force`: prefer replacing generated setup when initialization already
  exists.

### `shrike scan`

After `shrike init`, a plain `shrike scan` uses saved defaults from
`.openshrike/project.json` and executes the Markdown checks in
`.openshrike/checks/`. Without saved defaults, `scan` requires exactly one of
`--check` or `--policy`.

```bash
shrike scan \
  [--check <CHECK_ID> | --policy <POLICY_ID>] \
  [--repo <PATH>] \
  [--output json|markdown] \
  [--agent <NAME>] \
  [--model <PROVIDER/MODEL>] \
  [--emit-bundle <PATH>] \
  [--scan-scope uncommitted|commit|branch|pr|full] \
  [--scan-target <TARGET>] \
  [--mock-opencode] \
  [--config <PATH>] \
  [--log <PATH>] \
  [--runtime native|docker] \
  [--image <REF>] \
  [--artifacts-dir <PATH>] \
  [--parallelism <N|auto>] \
  [--no-ui]
```

Common behavior:

- `--repo .`, `--output markdown`, `--scan-scope uncommitted`, `--runtime native`,
  and `--parallelism auto` are the default values when not overridden by saved
  project settings.
- `commit` requires `--scan-target <COMMIT_OR_RANGE>`.
- `branch` requires `--scan-target <BASE_BRANCH>` and compares
  `<BASE_BRANCH>...HEAD`.
- `pr` uses `--scan-target <DIFF_SPEC>` or defaults to `origin/main...HEAD`.
- `full` scans the whole repository.
- `--runtime docker` runs an ephemeral worker container.
- If Docker is selected without `--image`, OpenShrike uses
  `openshrike-runtime:dev` and builds it from
  `docker/openshrike-runtime.Dockerfile` when needed.
- `--artifacts-dir` controls where runtime artifacts such as `report.json` and
  logs are written.
- In Docker mode, OpenShrike forwards only env vars explicitly referenced by
  the selected OpenCode config (`provider.*.env`, `${VAR}`, or `{env:VAR}`).
  Native/Docker parity depends on declaring required env vars in
  `.openshrike/opencode.json`.
- `--mock-opencode` exercises the scan path without live OpenCode calls.
- `--no-ui` disables the live terminal dashboard on stderr.

### `shrike fix`

Fix failing checks one by one and recheck them. Useful for closing out the long
tail of mechanical violations before a human review.

```bash
shrike fix \
  [--check <CHECK_ID> | --policy <POLICY_ID>] \
  [--repo <PATH>] \
  [--fix-agent <NAME>] \
  [--fix-model <PROVIDER/MODEL>] \
  [--scan-scope uncommitted|commit|branch|pr|full] \
  [--scan-target <TARGET>] \
  [--runtime native|docker] \
  [--last-scan]
```

- `--last-scan` reuses the saved `.openshrike/last-scan.json` report instead of
  rescanning first.
- `--fix-agent` and `--fix-model` override the OpenCode agent and model used
  for the repair pass; scan options behave the same as `shrike scan`.

## Examples

Use saved defaults:

```bash
shrike scan
```

Add or customize checks by editing Markdown files in `.openshrike/checks/`.

Run a specific policy without saved defaults:

```bash
shrike scan --policy typescript-baseline --repo .
```

Run a single check against a full repository:

```bash
shrike scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo ../OpenShrike.TestsCsharp \
  --scan-scope full
```

Run a PR-style scan in Docker:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope pr \
  --scan-target origin/main...HEAD \
  --runtime docker \
  --output json
```

## Output And Exit Codes

- `--output markdown` is the default and emits human-readable reports and error messages.
- `--output json` emits machine-readable reports and error envelopes.
- Exit code `0`: no failing checks.
- Exit code `2`: one or more failing checks.
- Exit code `1`: command or runtime error.

## Development

```bash
npm run dev -- scan --policy csharp-baseline --repo .
npm run build
npm run typecheck
npm test
```

The `./shrike` launcher uses `tsx src/cli.ts` when available and falls back to
`dist/cli.js`.

## Publish And Install

Create a local framework bundle:

```bash
scripts/publish.sh
```

Install from the published framework bundle:

```bash
scripts/install-local.sh --source .artifacts/publish/framework
```

Tagging a release with `v*` also triggers `.github/workflows/release-bundles.yml`
to build GitHub release archives for the supported Linux, macOS, and Windows
targets.

Prepare a release locally so only `git push` remains:

```bash
scripts/create-release.sh
```

That script bumps the patch version, stages all current changes, creates a
commit named `chore(release): vX.Y.Z`, and creates an annotated `vX.Y.Z` tag.
Use `scripts/create-release.sh minor`, `major`, or an explicit version to
override the default patch bump.

