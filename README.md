# OpenShrike

Security-first agentic code review CLI backed by OpenCode and a policy library.
The active implementation is now TypeScript/Node with an Ink terminal UI.

![logo](docs/openshrike-logo.png)

## What changed

- The TypeScript CLI lives in `src/` and is the active implementation.
- The previous C# solution was moved to `archive/legacy-csharp/` for reference.
- `shrike scan` now uses the OpenCode SDK and streams agent/tool activity into a separate live pane while the scan is running.
- `shrike init` writes runtime config into `.openshrike/` using an OpenCode-compatible config file plus env-file helpers.

## Quick start

Install dependencies and build:

```bash
npm install
npm run build
```

Generate runtime config in the current project:

```bash
./shrike init --force
```

Run a policy scan:

```bash
./shrike scan --policy csharp-baseline --repo .
```

## Runtime config

`shrike init` writes these files into `.openshrike/`:

- `opencode.json`: the runtime config consumed by OpenCode.
- `required-env.txt`: one environment variable name per line for container/runtime wiring.
- `runtime.env.example`: starter env-file with blank values.
- `README.md`: short usage note for the generated files.

The default config keeps secrets out of source control by using `${ENV_VAR}` placeholders. The generated default expects:

```text
AZURE_OPENAI_API_KEY
OPENSHRIKE_AZURE_OPENAI_BASE_URL
OPENSHRIKE_AZURE_OPENAI_API_VERSION
```

If you run `shrike` inside a container, pass those variables with your normal container mechanism, for example an env-file derived from `.openshrike/runtime.env.example`.

## Scan usage

Run exactly one of `--check` or `--policy`.

Examples:

```bash
./shrike scan --policy csharp-baseline --repo .
./shrike scan --check csharp-rel-001-cancellation-tokens --repo . --scan-scope commit --scan-target HEAD~1..HEAD
./shrike scan --policy csharp-baseline --repo . --scan-scope branch --scan-target origin/main
./shrike scan --policy csharp-baseline --repo . --scan-scope pr --scan-target origin/main...HEAD
./shrike scan --policy csharp-baseline --repo . --scan-scope full
```

Options:

- `--output json|markdown`
- `--emit-bundle <PATH>`
- `--agent <NAME>`
- `--model <provider/model>`
- `--config <PATH>`
- `--mock-opencode`
- `--no-ui`

Scope values:

- `uncommitted` (default)
- `commit`
- `branch`
- `pr`
- `full`

When stderr is interactive, `shrike scan` renders an Ink dashboard:

- left side: progress, scope, counters, and optional detailed check lists
- right side: streamed OpenCode events, assistant output, and reasoning text

Toggle detail lists with `d`, `Ctrl+T`, or `Ctrl+O`.

Use mock mode when you want to test the UI/report flow without calling OpenCode:

```bash
./shrike scan --policy csharp-baseline --repo . --scan-scope full --mock-opencode
```

## Development

Common commands:

```bash
npm run dev -- scan --policy csharp-baseline --repo .
npm run build
npm run typecheck
npm test
```

The root `./shrike` launcher runs the built CLI when `dist/cli.js` exists and falls back to `tsx` during development.

## Publish and install

Create a framework bundle:

```bash
scripts/publish.sh
```

This writes a runnable bundle to:

```text
.artifacts/publish/framework/
  shrike
  app/
    dist/
    node_modules/
    best_practices/
    package.json
    ...
```

Install from source with a symlink:

```bash
scripts/install-local.sh --source ./shrike --link
```

Install from the published framework bundle:

```bash
scripts/install-local.sh --source .artifacts/publish/framework
```

## Document map

- [Vision and scope](docs/requirements/01-project-vision.md)
- [Feature scope and phases](docs/requirements/02-feature-scope.md)
- [Security model](docs/requirements/03-security-model.md)
- [Agent runtime and isolation](docs/requirements/04-agent-runtime.md)
- [Best practices library](docs/requirements/05-best-practices-library.md)
- [Observability and feedback loop](docs/requirements/06-observability.md)
- [Workflows and integrations](docs/requirements/07-workflows-and-integrations.md)
- [Archived first implementation notes](docs/implementation/01-mvp-csharp-rel-001-implementation.md)
