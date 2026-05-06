# Shrike Init TUI Design

Status: implemented

Scope: `shrike init`

Primary implementation:

- `src/lib/init.ts`
- `src/lib/init/discovery.ts`
- `src/lib/init/project-detect.ts`
- `src/lib/init/write.ts`
- `src/ui/init-app.tsx`

## Summary

`shrike init` is an Ink-based repository bootstrap wizard. The implemented flow:

1. finds the repo root by walking up to `.git`,
2. detects whether `.openshrike/` already exists,
3. discovers user-global OpenCode config, auth, and binary availability,
4. detects the project type and ranks policy defaults,
5. writes repo-local Shrike config files,
6. offers either `Run \`shrike scan\``, `Change saved defaults`, or `Exit`.

The command does not embed OpenCode's own TUI and does not create provider or
credential files inside the repository. It reuses OpenCode only at the config
and auth boundary.

## Files Written

`shrike init` currently writes exactly three files under `.openshrike/`:

- `project.json`
- `opencode.json`
- `README.md`

It does **not** currently write `required-env.txt`, `runtime.env`, or
`runtime.env.example`.

### `.openshrike/project.json`

This is the canonical repo-local Shrike config. The structure written today is:

```json
{
  "$schema": "https://openshrike.dev/schema/project.json",
  "version": 1,
  "init": {
    "projectType": "typescript",
    "detectedFrom": ["package.json", "tsconfig.json", "src/**/*.ts"],
    "opencodeSetup": "existing-config"
  },
  "runtime": {
    "configPath": ".openshrike/opencode.json",
    "agent": "shrike-checker",
    "model": "azure/gpt-5.4-mini",
    "mode": "native",
    "parallelism": "auto"
  },
  "scan": {
    "defaultKind": "policy",
    "defaultId": "typescript-baseline",
    "repo": ".",
    "scope": "uncommitted",
    "output": "json",
    "ui": true,
    "artifactsDir": null
  }
}
```

Defaults written by implementation:

- runtime mode: `native`
- parallelism: `auto`
- scan scope: `uncommitted`
- output: `json`
- UI: enabled
- artifacts dir: `null`
- agent: `shrike-checker`

### `.openshrike/opencode.json`

This is a Shrike-owned OpenCode overlay, not a copy of user-global provider
configuration. It is generated from `buildDefaultOpencodeConfig()` and contains
read-only session permissions plus the selected model.

Example shape:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "azure/gpt-5.4-mini",
  "permission": {
    "bash": "allow",
    "edit": "deny",
    "webfetch": "deny",
    "doom_loop": "deny",
    "external_directory": "deny"
  },
  "agent": {
    "shrike-checker": {
      "description": "Runs OpenShrike checks in a read-only review session.",
      "model": "azure/gpt-5.4-mini",
      "permission": {
        "bash": "allow",
        "edit": "deny",
        "webfetch": "deny",
        "doom_loop": "deny",
        "external_directory": "deny"
      }
    }
  }
}
```

### `.openshrike/README.md`

This is a small generated note explaining that the directory is owned by
`shrike init`, that `project.json` stores repo-local defaults, and that
user-global OpenCode config/auth remain outside the repository.

## Discovery Inputs

### Repo root

`findRepoRoot()` walks upward from the current working directory until it finds
`.git`. If none is found, the current directory is treated as the repo root.

### Existing initialization

`discoverExistingInit()` checks for:

- `.openshrike/project.json`
- `.openshrike/opencode.json`
- `.openshrike/README.md`

If any of them exist, the wizard starts on the existing-init screen.

### OpenCode config and auth

`discoverOpenCodeSetup()` looks for:

- config: `~/.config/opencode/opencode.json`
- auth: `~/.local/share/opencode/auth.json`

Detected states are:

- `ready`
- `needs-auth`
- `not-installed`
- `invalid-config`
- `no-models`

### OpenCode binary resolution

Binary lookup order is:

1. `opencode` on `PATH`
2. `<toolRoot>/node_modules/.bin/opencode`
3. `<toolRoot>/node_modules/.bin/opencode.cmd`

If no binary is found and no usable OpenCode config exists, the wizard moves to
the install screen.

### Project type detection

Supported project types:

- `typescript`
- `javascript`
- `python`
- `python-ml`
- `pytorch`
- `csharp`
- `go`
- `java`
- `shared`

Detection is implemented in `src/lib/init/project-detect.ts` using weighted
markers. Policy ranking prefers the recommended baseline for the detected type,
adjacent policies, then `shared-foundation`.

## Implemented State Machine

The wizard is a single loop over `InitScreen` in `src/lib/init.ts`.

### `existing-init`

Prompt: `Project is already initialized`

Shown when at least one generated `.openshrike/*` file already exists.

Options:

- `Update existing setup`
- `Clear and run setup again`
- `Exit without changes`

Behavior:

- `update` loads values from the existing `project.json` into selections and
  jumps directly to `change-defaults`.
- `replace` resets selections to detected defaults and goes to
  `opencode-discovery`.
- `exit` returns `{action: 'exit', wroteFiles: false}`.
- `--force` does not bypass the screen. It only changes the initial selection
  from `update` to `replace`.

### `opencode-discovery`

Prompt depends on status:

- `OpenCode discovery` when status is `ready`
- `OpenCode authentication required` when status is `needs-auth`

Transitions:

- `not-installed` skips this screen and enters `opencode-install`
- `invalid-config` and `no-models` enter `error`

Options when `ready`:

- `Use discovered OpenCode config`
- `Re-authenticate with \`opencode auth login\``
- `Exit without changes`

Options when `needs-auth`:

- `Launch \`opencode auth login\``
- `Exit without changes`

Behavior:

- `auth-login` suspends the Ink UI, runs `opencode auth login`, then refreshes
  discovery and returns to this state.
- `use-discovered` continues into model selection when more than one model is
  available, otherwise it goes directly to policy selection.

### `opencode-install`

Prompt: `OpenCode not found`

Options are returned by `getOpenCodeInstallOptions()`:

- `curl -fsSL https://opencode.ai/install | bash`
- `npm install -g opencode-ai`
- `brew install anomalyco/tap/opencode`
- `Back`

Behavior:

- selecting an install option suspends the UI, runs the command with inherited
  stdio, then re-runs discovery;
- `Back` or `b` returns to `opencode-discovery`;
- failures go to `error` with retry/back/cancel.

### `model-selection`

Prompt: `Select default model`

Shown only when:

- discovered OpenCode config exposes more than one model, or
- the user chooses `Model` from `change-defaults`.

Behavior:

- searchable list
- initial selection is the current saved model
- back returns either to `opencode-discovery` or `change-defaults`

### `policy-selection`

Prompt: `Select default policy`

Always shown for first-time initialization. Also reused from `change-defaults`
when the user edits the saved policy.

Behavior:

- policy list is built from the real policy catalog on disk
- list is searchable
- note block is fixed to `native • uncommitted • auto • json`
- first-time confirmation writes files immediately and goes to `success`
- editing from `change-defaults` rewrites files and returns to
  `change-defaults`

### `success`

Prompt: `Setup complete`

Summary fields shown:

- provider
- model
- default policy
- runtime mode

Options:

- `Run \`shrike scan\``
- `Change saved defaults`
- `Exit`

Behavior:

- `run-scan` returns `{action: 'run-scan'}` from `runInitCommand()`
- `change-defaults` opens the compact defaults editor
- `exit` returns `{action: 'exit'}`

The actual scan is not launched from `runInitCommand()` itself. The command
wrapper in `src/commands/init.ts` receives `action: 'run-scan'` and then calls
`executeScanCommand()`.

### `change-defaults`

Prompt: `Change saved defaults`

Options:

- `Policy: <current>`
- `Model: <current>` only when more than one discovered model exists
- `Runtime: <current>`
- `Done`

Behavior:

- entered from `success`, or from `existing-init -> update`
- `policy` reuses `policy-selection`
- `model` reuses `model-selection`
- `runtime` enters `runtime-selection`
- `done` returns to `success`

### `runtime-selection`

Prompt: `Select runtime mode`

Options:

- `native`
- `docker`

Behavior:

- confirmation rewrites the generated files immediately
- success returns to `change-defaults`
- back returns to `change-defaults`

### `error`

The error screen is a generic recovery screen with prompt and lines coming from
`context.error`.

Options:

- `Retry`
- `Back`
- `Cancel`

Implemented retry actions:

- `refresh-opencode`
- `auth-login`
- `install-curl`
- `install-npm`
- `install-brew`
- `write-files`
- `none`

## UI Behavior

The shared UI shell lives in `src/ui/init-app.tsx`.

Implemented behavior:

- previously completed steps are rendered as collapsed history above the active
  prompt;
- searchable screens support plain-text filtering plus backspace/delete;
- `Esc` cancels on all current screens;
- `b` goes back only when the screen enables it;
- `Ctrl+C` cancels the flow;
- key hints are built from screen capabilities.

The generic UI supports `helpLines` and a `?` keybinding, but `shrike init`
does not currently pass `helpLines` for any screen, so help is not shown in the
current implementation.

## Cancellation and Exit Codes

`runInitCommand()` throws `InitCommandCancelledError` when the UI is cancelled.
`executeInitCommand()` converts that to exit code `130`.

Other errors are surfaced normally.

## `shrike scan` After Init

`resolveScanOptions()` merges settings in this order:

1. explicit CLI flags
2. `.openshrike/project.json`
3. hardcoded defaults

This means the zero-arg workflow is implemented:

```bash
shrike init
shrike scan
```

as long as `project.json` provides a default `check` or `policy`. The files
written by `shrike init` always set `defaultKind: "policy"`.

## Current Gaps Relative To The Old Proposal

The older proposal in this file included behavior that is not shipped. The
current implementation deliberately does **not** do the following:

- write env-helper files alongside `.openshrike/opencode.json`
- embed or drive the OpenCode `/connect` TUI
- provide a Shrike-owned provider picker
- expose scan scope, output format, or parallelism as separate init screens
- treat `--force` as a non-interactive overwrite flag
- provide a dedicated write-conflict workflow beyond existing-init detection and
  generic write errors

This document is the source of truth for the behavior currently implemented in
the TypeScript codebase.
