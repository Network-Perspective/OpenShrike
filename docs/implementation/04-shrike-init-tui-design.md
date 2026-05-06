# Shrike Init TUI Design

Status: proposed

Scope: `shrike init` only

Related commands:

- `shrike init`
- `shrike scan`
- `shrike fix` later, but not specified here

## Summary

`shrike init` should become an interactive repository bootstrap command that:

1. detects whether the repo is already initialized,
2. discovers existing OpenCode user config and credentials,
3. runs `opencode auth login` if OpenCode is not configured yet,
4. lets the user choose a default model only when multiple models are already
   available,
5. detects the project type, recommends a baseline policy, and saves defaults so
   `shrike scan` can run with no extra flags.

The main output is not a copy of the best-practices library. The main output is
repo-local configuration that tells Shrike which policy to run and which
runtime defaults to use.

## Key Decisions

### 1. Do not copy policy/check markdown into the target repo in MVP

`init` should store:

- the selected default policy id,
- detected project type,
- default scan/runtime settings,
- the repo-local OpenCode overlay.

It should not copy `best_practices/checks/**` or `best_practices/policies/**`
into the repo during MVP.

Rationale:

- copied markdown will drift from the installed Shrike version,
- it creates noisy repo diffs for something that is effectively tool data,
- zero-arg `shrike scan` only needs a saved default policy, not duplicated
  check definitions.

If policy pinning becomes necessary later, add a separate lock file or
`shrike vendor-policy` command.

### 2. Save Shrike defaults separately from OpenCode config

OpenCode config and Shrike defaults should not share one file.

Proposed files:

- `.openshrike/opencode.json`
- `.openshrike/project.json`
- `.openshrike/README.md`

Reason:

- `opencode.json` should stay valid OpenCode config,
- Shrike-specific fields like default policy, scan scope, or artifacts dir do
  not belong in OpenCode config,
- `init` should not create repo-local provider or credential files,
- this keeps future `shrike fix` defaults in the same repo-local namespace.

### 3. `shrike init` should be an Ink TUI

The repo already ships an Ink-based UI for `shrike scan`, so `init` should use
the same stack instead of adding a second prompt or TUI framework.

### 4. Reuse OpenCode at the config/auth boundary, not at the embedded TUI boundary

The right reuse level is:

- discover OpenCode config and credentials,
- prefer calling `opencode auth login` as a subprocess when auth is missing,
- inspect discovered config for model choices when multiple are available,
- write a Shrike-owned repo-local OpenCode overlay.

Do not try to embed or drive the OpenCode `/connect` TUI inside Shrike.

### 5. Prefer real OpenCode auth handoff over a Shrike-owned provider picker

If OpenCode is installed but user config/auth is missing, the path should be:

- suspend the Shrike Ink UI,
- run `opencode auth login` with `stdio: inherit`,
- return to the wizard and rediscover config/auth,
- continue once a provider is available.

There should be no Shrike-native provider configuration flow in `init`.

### 6. Keep `init` opinionated and short

Do not ask users to configure everything.

Recommended implicit defaults:

- runtime mode: `native`
- scan scope: `uncommitted`
- parallelism: `auto`
- output: `json`
- UI: enabled

These defaults should be written automatically rather than exposed as separate
wizard screens.

### 7. Smaller models are acceptable defaults

For local review loops, smaller models are often good enough.

Examples:

- `gpt-5.4-mini`
- a Haiku-class model

If multiple models are already available in the discovered OpenCode config,
`init` should let the user choose one. If only one model is available, skip the
question.

## UX Goals

- A first-time user should get from zero to a working `shrike scan` in one
  flow.
- A user with existing OpenCode setup should not have to re-enter provider
  details.
- The wizard should make recommended choices fast, but every important choice
  must be reviewable.
- The flow should stay deterministic and repo-focused. User-global discovery is
  an input, not hidden magic.

## Non-goals

- Editing arbitrary advanced OpenCode config from inside Shrike.
- Full parity with every OpenCode provider flow in the first version.
- Full policy customization or per-check override editing in the first version.
- Implementing `shrike fix`.

## Files Written By `shrike init`

### 1. `.openshrike/project.json`

Canonical Shrike repo-local config.

Example:

```json
{
  "$schema": "https://openshrike.dev/schema/project.json",
  "version": 1,
  "init": {
    "projectType": "typescript",
    "detectedFrom": ["package.json", "tsconfig.json"],
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

Notes:

- `defaultKind` is `policy` for MVP.
- `defaultId` is the selected policy id.
- CLI flags always override `project.json`.

### 2. `.openshrike/opencode.json`

Shrike-owned OpenCode config used for scans.

This file should be an overlay only:

- contains Shrike-specific settings like model override,
  `shrike-checker` agent, and read-only permissions,
- relies on user-global OpenCode config/auth for provider credentials,
- does not contain repo-local provider setup or secrets created by `init`.

### 3. `.openshrike/README.md`

Small generated note explaining what each file is for and how to refresh the
setup.

## `shrike scan` Behavior After Init

`shrike scan` should resolve effective options in this order:

1. explicit CLI flags,
2. `.openshrike/project.json`,
3. hardcoded defaults.

Important change:

- `--check` or `--policy` is no longer required if `project.json` provides a
  default.

Validation rule becomes:

- after merging CLI + repo config, exactly one of `checkId` or `policyId` must
  be present.

This change is required for the workflow:

```bash
shrike init
shrike scan
```

## OpenCode Command Resolution

`shrike init` should resolve `opencode` in this order:

1. `opencode` already on `PATH`,
2. repo-local `node_modules/.bin/opencode`,
3. otherwise show install guidance.

Design implication:

- contributors who ran `npm install` should be able to use the repo-local
  `opencode` binary,
- `npm run build` is not the thing that makes `opencode` available; dependency
  installation is,
- `init` should resolve the binary explicitly or prepend `node_modules/.bin`
  before spawning auth/login flows.

## Wizard Structure

The wizard should be a small state machine, not a pile of nested prompts.

High-level states:

1. existing-init handling
2. OpenCode discovery / auth handoff
3. install OpenCode, only when needed
4. model selection, only when needed
5. policy selection
6. write and success actions

Consistent keys:

- `Up` / `Down`: move selection
- `Enter`: continue
- `b`: back
- `Esc`: cancel
- `Type`: search/filter when relevant
- `?`: help

## Detailed Screen Flow

All wireframes below should follow the OpenCode TUI visual language:

- lightweight frame with `┌  <title>` and `└`,
- primary prompt line with `◆`,
- selectable rows with `○` and `●`,
- inline help text at the bottom instead of button-like controls.

Visual treatment from the reference screenshot:

- background: solid black,
- primary text: bright neutral foreground for titles, active section labels, and
  selected item text,
- secondary text: dim gray for labels, helper copy, and unselected list items,
- accent: cyan/teal for the left rail, prompt diamond, and focused structural
  accents,
- selection indicator: green filled dot for the active list row,
- warnings/errors: reserve yellow and red for exceptional states only; do not
  overload the default selection flow with warning colors.

Implementation note:

- centralize these colors in a shared theme module instead of hardcoding Ink
  color strings per screen,
- keep one source of truth for spacing, indentation, and key-hint formatting so
  the entire wizard tracks the same visual rhythm as OpenCode.

### Screen 0: Existing Initialization Detected

Purpose:

- handle re-entry cleanly.

Wireframe:

```text
┌  Shrike init
│
◆  Existing setup found
│  Existing files:
│  • .openshrike/project.json
│  • .openshrike/opencode.json
│
│  Current defaults:
│  policy: typescript-baseline
│  model: azure/gpt-5.4-mini
│
│  ● Update existing setup
│  ○ Replace generated files
│  ○ Exit without changes
│
│  ↑/↓ to select • Enter: confirm • b: back • Esc: cancel
└
```

Implementation notes:

- `--force` can preselect "Replace generated files",
- "update existing setup" should load current values as defaults in later
  screens.

### Screen 1: OpenCode Discovery

Purpose:

- detect user-global OpenCode config and auth state,
- decide whether Shrike can continue immediately or needs OpenCode auth first.

Detection targets:

- `~/.config/opencode/opencode.json`
- `~/.local/share/opencode/auth.json`

Wireframe:

```text
┌  Shrike init
│
◆  OpenCode discovery
│  Found user OpenCode config:
│  ~/.config/opencode/opencode.json
│
│  Summary:
│  default model: azure/gpt-5.4-mini
│  providers: azure
│  auth store: present
│
│  ● Use discovered OpenCode setup as the base
│  ○ Re-run `opencode auth login`
│  ○ Exit without changes
│
│  ↑/↓ to select • Enter: confirm • b: back • Esc: cancel
└
```

Implementation notes:

- parse discovered config into a compact summary,
- if usable config/auth is missing but `opencode` is resolvable, this screen
  should instead present `Launch \`opencode auth login\`` as the primary action,
- if `opencode` is not resolvable, replace the screen with the install help
  screen below,
- choosing the auth action should suspend Ink, run `opencode auth login` with
  `stdio: inherit`, then return here and rediscover config/auth.

### Screen 2: OpenCode Install Help

Shown when OpenCode auth/config is missing and `opencode` is not resolvable.

Purpose:

- explain why Shrike cannot launch the OpenCode auth flow,
- offer install options and run the selected one immediately on confirm.

Wireframe:

```text
┌  Shrike init
│
◆  OpenCode not found
│  `opencode` is not available on PATH and no repo-local binary
│  was found.
│
│  Select an install method:
│
│  ● curl -fsSL https://opencode.ai/install | bash
│  ○ npm install -g opencode-ai
│  ○ brew install anomalyco/tap/opencode
│  ○ Back
│
│  ↑/↓ to select • Enter: run selected command • b: back
└
```

Implementation notes:

- only run an installer after explicit selection and `Enter`,
- suspend Ink and run the selected command with `stdio: inherit`,
- after the installer exits, rerun OpenCode discovery,
- on failure, offer retry/back rather than dropping the user out of the flow.

### Screen 3: Choose Default Model

Shown only when multiple models are available in the discovered OpenCode config.

Purpose:

- let the user pick a cheap, reasonable default for local review loops.

Wireframe:

```text
┌  Shrike init
│
◆  Select default model
│  Multiple models were found in your OpenCode config.
│  Smaller models are fine for local scans, e.g. `gpt-5.4-mini`
│  or a Haiku-class model.
│
│  Search:
│  ...
│  ● azure/gpt-5.4-mini
│  ○ azure/gpt-5.4
│  ○ anthropic/haiku
│
│  ↑/↓ to select • Enter: confirm • Type: to search • b: back
└
```

Implementation notes:

- if only one model is available, skip this screen,
- preserve the discovered provider/model identifier exactly; do not invent a new
  repo-local provider definition.

### Screen 4: Choose Default Policy

Purpose:

- choose the policy that `shrike scan` will use by default.

Wireframe:

```text
┌  Shrike init
│
◆  Select default policy
│  Detected project type: TypeScript
│  Evidence: package.json, tsconfig.json
│
│  ● typescript-baseline
│  ○ shared-foundation
│  ○ javascript-baseline
│
│  Other defaults are written automatically:
│  native • uncommitted • auto • json
│
│  ↑/↓ to select • Enter: confirm • b: back
└
```

Implementation notes:

- policy selection should be driven from the existing
  `best_practices/policies/*.md` catalog, not hardcoded strings in the UI,
- recommendations are ranked, not enforced,
- do not open a separate screen for runtime/output/parallelism defaults,
- confirming this step should immediately write `.openshrike/project.json`,
  `.openshrike/opencode.json`, and `.openshrike/README.md`.

### Screen 5: Success Actions

Purpose:

- confirm the setup and offer immediate next actions.

Wireframe:

```text
┌  Shrike init
│
◆  Setup complete
│  Repository initialized for Shrike.
│
│  Provider:        azure
│  Model:           azure/gpt-5.4-mini
│  Default policy:  typescript-baseline
│  Runtime mode:    native
│
│  ● Run `shrike scan`
│  ○ Change saved defaults
│  ○ Exit
│
│  ↑/↓ to select • Enter: confirm
└
```

Implementation notes:

- this screen appears only after files are written successfully,
- selecting `Run \`shrike scan\`` should launch the command directly from the
  screen,
- selecting `Change saved defaults` should open a compact submenu rather than
  re-running the whole wizard.

### Screen 6: Change Saved Defaults

Shown when the user selects `Change saved defaults` from the success screen.

Purpose:

- let the user adjust one area without repeating the full flow.

Wireframe:

```text
┌  Shrike init
│
◆  Change saved defaults
│
│  ● Policy: ......
│  ○ Model: .....
│  ○ Runtime: .......
│  ○ Back
│
│  ↑/↓ to select • Enter: confirm • b: back
└
```

Implementation notes:

- choosing `Policy` should reopen only the policy selector,
- choosing `Model` should reopen only the model selector when multiple models
  are available,
- choosing `Runtime` should open a minimal runtime selector with `native` and
  `docker`,
- after a change is confirmed, rewrite the affected config and return to the
  success screen.

## Error and Recovery Screens

Required recovery cases:

- discovered OpenCode config is invalid JSON,
- discovered config exists but contains no usable provider/model defaults,
- `opencode auth login` subprocess fails or is cancelled,
- write conflict without `--force`,
- repo is not writable.

Every error screen should offer:

- retry,
- back,
- cancel.

## Project Type Detection Heuristics

Use weighted markers and return a ranked list with confidence.

### TypeScript

Strong markers:

- `tsconfig.json`
- `package.json` with `typescript` dependency
- `src/**/*.ts` or `src/**/*.tsx`

Default recommendation:

- `typescript-baseline`

### JavaScript

Strong markers:

- `package.json`
- `src/**/*.js`, `src/**/*.mjs`, `src/**/*.cjs`

Negative marker:

- `tsconfig.json` should lower JavaScript ranking if TypeScript is detected

Default recommendation:

- `javascript-baseline`

### Python

Strong markers:

- `pyproject.toml`
- `requirements.txt`
- `setup.py`
- `*.py`

Default recommendation:

- `python-baseline`

### Python ML

Additional markers on top of Python:

- `notebooks/`
- `jupyter`, `pandas`, `scikit-learn`, `mlflow`, `xgboost` dependencies
- `train.py`, `evaluate.py`, `notebook.ipynb`

Default recommendation:

- `python-ml-baseline`

### PyTorch

Additional markers on top of Python:

- `torch` dependency
- `import torch`
- `lightning`, `accelerate`

Default recommendation:

- `pytorch-baseline`

### C#

Strong markers:

- `*.sln`
- `*.csproj`
- `Directory.Build.props`

Default recommendation:

- `csharp-baseline`

### Go

Strong markers:

- `go.mod`
- `*.go`

Default recommendation:

- `go-baseline`

### Java

Strong markers:

- `pom.xml`
- `build.gradle`
- `settings.gradle`
- `*.java`

Default recommendation:

- `java-baseline`

### Fallback

If multiple ecosystems are present or confidence is weak:

- recommend `shared-foundation`,
- allow manual policy selection from the full catalog.

## Data Model Changes

### New type: Shrike project config

Add a dedicated loader/validator for `.openshrike/project.json`.

Suggested shape:

```ts
interface ShrikeProjectConfig {
  version: 1;
  init: {
    projectType: string;
    detectedFrom: string[];
    opencodeSetup: 'existing-config' | 'auth-login';
  };
  runtime: {
    configPath: string;
    agent: string;
    model?: string;
    mode: 'native';
    parallelism: 'auto';
  };
  scan: {
    defaultKind: 'policy';
    defaultId: string;
    repo: '.';
    scope: 'uncommitted';
    output: 'json';
    ui: true;
    artifactsDir: null;
  };
}
```

### Scan option merge

Add a pre-validation merge step:

1. read CLI args,
2. load `.openshrike/project.json` if present,
3. produce effective `ScanCommandOptions`,
4. validate merged result.

This should happen before the current "exactly one of check or policy" rule.

## OpenCode Reuse Strategy

### Verdict

Do not plan on directly reusing OpenCode's `/connect` UI implementation as a
library dependency in MVP.

Recommended approach:

1. discover OpenCode user config and auth files,
2. hand off to `opencode auth login` when config/auth is missing,
3. re-run discovery when that subprocess returns,
4. write Shrike's own repo-local OpenCode overlay/config.

This preserves the exact provider picker and search UX from OpenCode instead of
re-creating it inside Shrike.

### Why

- the current repo depends on `opencode-ai` and `@opencode-ai/sdk`, but the SDK
  is the documented programmatic surface for server/client operations, not for
  the `/connect` dialog,
- the repo-local Shrike scan path already spawns `opencode serve` and passes
  config via `OPENCODE_CONFIG_CONTENT`,
- an embedded TUI inside another TUI will be brittle around TTY ownership,
  redraw, and error recovery.

### Acceptable reuse boundaries

### Good reuse

- parse `~/.config/opencode/opencode.json`,
- rely on `~/.local/share/opencode/auth.json` if present,
- spawn `opencode auth login`,
- optionally inspect discovered model lists from config for model selection.

### Command availability

- when Shrike is run from source, prefer the repo-local
  `node_modules/.bin/opencode` if present,
- otherwise use `opencode` from the user's PATH,
- only show install guidance when neither is available.

### Bad reuse

- shelling into `opencode` and trying to drive `/connect` keystrokes,
- importing upstream internal TUI source as if it were a stable public API,
- coupling Shrike's wizard state to upstream screen layout or copy.

### If exact UI parity becomes necessary later

Treat it as vendoring, not dependency reuse:

- copy the minimal upstream implementation into a Shrike-owned module,
- pin it to a known upstream commit,
- add smoke tests around the expected provider flows,
- expect manual sync work when OpenCode changes.

## Implementation Layout

Suggested modules:

- `src/ui/init-app.tsx`
- `src/ui/init-theme.ts`
- `src/ui/init-controls.tsx`
- `src/lib/init/discovery.ts`
- `src/lib/init/project-detect.ts`
- `src/lib/init/write.ts`
- `src/lib/init/state.ts`
- `src/lib/project-config.ts`

Existing files to evolve:

- `src/commands/init.ts`
- `src/lib/init.ts`
- `src/lib/scan-options.ts`
- `src/lib/types.ts`

### Recommended internal split

`init-app.tsx`

- owns rendering and input only

`init-theme.ts`

- exports color tokens, spacing constants, and text-style helpers
- keeps Shrike's init UI visually aligned with the OpenCode reference

`init-controls.tsx`

- exports shared Ink controls used across all screens
- prevents each step from hand-assembling its own frame, picker, or hint bar

`state.ts`

- pure state machine
- screen transitions
- validation errors

`discovery.ts`

- find repo root
- detect existing `.openshrike` files
- detect OpenCode global config and auth
- resolve the `opencode` binary path

`write.ts`

- write `.openshrike/*`

`project-config.ts`

- read/write/validate Shrike repo config

### Shared controls to keep the UI DRY

The wizard should be built from a small set of reusable controls rather than
screen-specific JSX trees.

Suggested shared controls:

- `DialogFrame`
  - renders the `┌  title` header, left rail, inner padding, and bottom cap
- `DialogPrompt`
  - renders the `◆` prompt line with accent color and optional subtitle block
- `SelectList<T>`
  - renders `○` / `●` rows, selected text color, and keyboard hint footer
- `SearchableSelect<T>`
  - wraps `SelectList<T>` with a search label and query state
  - fits both policy and model pickers
- `SummaryBlock`
  - renders compact discovery summaries such as provider, auth status, and
    current model
- `KeyHintBar`
  - renders standardized help text such as
    `↑/↓ to select • Enter: confirm • Type: to search`
- `ActionMenu`
  - renders post-write actions like `Run shrike scan`, `Change saved defaults`,
    and `Exit`
- `RuntimeSelector`
  - renders the small native/docker selector used only from the post-write
    defaults menu

Practical rule:

- a new step should mostly declare data and behavior, then compose shared
  controls,
- if a screen needs custom layout, build it from the same primitives instead of
  introducing one-off styling rules.

## Incremental Delivery Plan

### Phase 1

Minimal usable end-to-end with OpenCode-managed auth:

- add `.openshrike/project.json`,
- make `shrike scan` load defaults from it,
- add TUI that discovers global OpenCode config,
- add `opencode` binary resolution and install-help screen,
- add auth handoff via `opencode auth login`,
- add conditional model selection when multiple models are available,
- allow selecting policy while saving the other defaults automatically,
- write repo-local overlay config.

This already enables:

- `shrike init`
- `shrike scan`

for users with existing OpenCode setup or a working `opencode auth login`
handoff.

## Testing Plan

## Unit tests

- discovery of global OpenCode config path
- parse failure handling for invalid config
- discovered model list normalization
- install command selection
- project type ranking
- policy recommendation mapping
- Shrike project config read/write
- scan default merge precedence
- conditional model selection skip/ask logic
- post-write action routing

## Integration tests

- `shrike init` with discovered OpenCode config
- `shrike init` with auth handoff and rediscovery
- `shrike init` install-method selection and rediscovery
- rerun init over an existing `.openshrike` directory
- `shrike scan` with no `--policy` using saved defaults
- post-write `shrike scan` launch from the success screen

## Manual smoke tests

- TTY auth handoff to `opencode auth login`
- narrow terminal width
- cancel on every screen
- incomplete setup path followed by successful retry

## Final Recommendation

Build `shrike init` as a Shrike-owned Ink wizard that:

- discovers and reuses user-global OpenCode setup,
- hands off to `opencode auth login` if setup is missing,
- lets the user choose a default model only when multiple models are already
  available,
- writes repo-local Shrike defaults,
- writes a repo-local OpenCode overlay/config,
- saves a default policy so `shrike scan` works with no extra flags.

Do not copy checks into the repo in MVP.

Do not embed OpenCode's `/connect` TUI in Shrike.

Reuse OpenCode at the stable seams:

- config discovery,
- auth file reuse,
- `opencode auth login` subprocess handoff,
- discovered model metadata from config,
- runtime server invocation.
