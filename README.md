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
  uncommitted changes in the current repository. If there are no uncommitted
  changes, plain `shrike scan` asks whether it should run a full-repository
  scan instead.
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

Each command has a `--help` flag with the full option list. The examples below
cover the common cases.

### `shrike init`

Interactively initialize Shrike defaults in the local `.openshrike` directory.

```bash
shrike init           # first-time setup
shrike init --force   # re-seed and overwrite existing files
shrike init --help    # full reference
```

### `shrike scan`

Run a check or policy bundle against a repository. After `shrike init`, a plain
`shrike scan` uses saved defaults from `.openshrike/project.json` and executes
the Markdown checks in `.openshrike/checks/`.

```bash
shrike scan                          # use saved defaults on uncommitted changes
shrike scan --scope branch \
  --target main                      # scan the current branch vs. main
shrike scan --scope pr \
  --target develop...HEAD            # PR-style diff scan
shrike scan --scope full             # scan the whole repository
shrike scan --policy csharp-baseline # run a specific policy
shrike scan --runtime docker         # run in an ephemeral container
shrike scan --help                   # full reference
```

### `shrike fix`

Fix failing checks one by one and recheck them. Useful for closing out the long
tail of mechanical violations before a human review.

```bash
shrike fix                # fix using saved defaults
shrike fix --last-scan    # reuse .openshrike/last-scan.json instead of rescanning
shrike fix --scope branch \
  --target main           # fix changes on the current branch vs. main
shrike fix --help         # full reference
```

## Output And Exit Codes

- `--output markdown` is the default and emits human-readable reports and error messages.
- `--output json` emits machine-readable reports and error envelopes.
- Exit code `0`: no failing checks.
- Exit code `2`: one or more failing checks.
- Exit code `1`: command or runtime error.

## Development

```bash
npm run dev -- scan --policy csharp-baseline --path .
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

