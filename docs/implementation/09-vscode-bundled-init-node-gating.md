# VS Code Bundled Init with Node Gating

Date: 2026-06-10

Status: proposed

Scope:

- gate the OpenShrike initialization CTA on Node.js availability on the
  workspace host
- run the bundled `shrike init` CLI from the installed extension instead of
  assuming a global `shrike` command
- surface a clear install path when Node.js is missing or too old
- refresh Node.js prerequisite status when the OpenShrike summary view regains
  visibility

Primary files expected to change or be added during implementation:

- `package.json`
- `src/vscode/extension.ts`
- `src/vscode/commands.ts`
- `src/vscode/extension-model.ts`
- `src/vscode/scan-data.ts`
- `src/vscode/scan-view-model.ts`
- `src/vscode/views/summary-view.ts`
- `src/vscode/views/summary-html.ts`
- new `src/vscode/init-environment.ts`
- tests covering the view-model mapping and command behavior

## Summary

The current VS Code extension still assumes that the user installed a global
`shrike` CLI and can run `shrike init` from the integrated terminal. This is a
poor first-run experience on a clean machine.

The proposed change keeps `shrike init` terminal-first and Ink-based, but
removes the need for a separate global `shrike` install. The extension will:

1. check whether the workspace host can run Node.js `>=22`,
2. enable `Run shrike init` only when that prerequisite is satisfied,
3. launch the bundled CLI from the installed extension root,
4. otherwise show `Install Node.js` as the primary setup action and open the
   official download page.

This is an incremental UX improvement. It does not move the init wizard into
native VS Code UI or a webview.

## Current Behavior

Today the summary view renders a setup card that links to
`openshrike.runInitInTerminal`, and that command creates a terminal and sends:

```text
shrike init
```

This has three problems:

- it assumes `shrike` exists on `PATH`,
- it gives no direct signal when Node.js is missing or too old,
- it does not distinguish the extension host's Node runtime from the user's
  terminal/runtime environment.

## Goals

- No global `shrike` install should be required for extension users.
- `shrike init` should continue to run in a real terminal TTY so the existing
  Ink UI can remain unchanged.
- The extension should explicitly detect whether Node.js `>=22` is available on
  the workspace host before offering the init action.
- The summary view should reflect that prerequisite status immediately when the
  OpenShrike panel regains focus.
- The failure mode should be explicit and actionable instead of a broken
  command.

## Non-Goals

- No reimplementation of `shrike init` inside a webview.
- No automatic Node.js installation.
- No attempt to change the OpenCode auth flow in this pass.
- No change to scan, recheck, or fix behavior in this pass.

## Important Constraint

The bundled CLI still requires Node.js. The CLI entrypoint is a Node script and
the package declares `engines.node >=22`.

That means this feature improves the extension-first setup flow, but it does
not make the CLI self-contained on a machine with no compatible Node runtime.

## Decision Record

- Node.js readiness must be evaluated against the workspace host, not the
  extension host runtime.
- The extension host's own `process.version` and `process.execPath` must not be
  used as proof that the user can run the CLI.
- The existing command id `openshrike.runInitInTerminal` should remain the main
  init entrypoint, but its implementation should change from `shrike init` to
  launching the bundled CLI by absolute path.
- The extension should continue using a terminal surface for init because the
  Ink wizard requires interactive stdio.
- The launched init terminal should receive
  `OPENSHRIKE_TOOL_ROOT=<extensionRoot>` so asset and bundled-binary discovery
  are deterministic.
- The summary view should offer `Install Node.js` as the primary action only
  when the Node.js prerequisite is blocked.
- The install action should open the official Node.js download page with
  `vscode.env.openExternal(...)`.

## Workspace vs Local Machine

The extension is declared as a workspace extension. In local VS Code this means
the check runs on the local machine. In WSL, SSH, dev containers, or Codespaces
it runs on the remote workspace host.

That has two user-facing consequences:

- the Node.js check must run where the extension runs,
- the `Install Node.js` button can only open documentation in the user's local
  browser, not perform the install.

The setup copy should say that Node.js must be available on the current
workspace host.

## Proposed UX

### 1. No workspace open

Keep the existing behavior:

- show `Repository initialization required`,
- explain that a workspace folder must be opened first,
- do not show the Node.js actions.

### 2. Repository uninitialized, Node.js status is checking

Show a transient setup state:

- title: `Repository initialization required`
- status line: `Checking Node.js on the workspace host...`
- no clickable init action yet
- no install action yet

This avoids a flash of the wrong CTA while the first probe is running.

### 3. Repository uninitialized, Node.js ready

Show:

- primary button: `Run shrike init`
- helper copy explaining that OpenShrike will run the bundled init wizard in
  the integrated terminal
- a small status line such as `Node.js v22.18.0 detected`

The UI should not mention `npm install -g` or a global CLI.

### 4. Repository uninitialized, Node.js missing

Show:

- a disabled `Run shrike init` action
- primary button: `Install Node.js`
- status line: `Node.js was not found on the workspace host`
- helper copy explaining that OpenShrike needs Node.js `22+` before it can run
  the bundled init wizard

### 5. Repository uninitialized, Node.js too old

Show:

- a disabled `Run shrike init` action
- primary button: `Install Node.js`
- status line such as `Found Node.js v20.12.2, but OpenShrike requires 22+`
- helper copy identical to the missing case

### 6. Repository uninitialized, probe error

Show:

- a disabled `Run shrike init` action
- primary button: `Install Node.js`
- status line such as `Could not verify Node.js on the workspace host`
- helper copy telling the user to verify `node --version` in a terminal if the
  install page does not resolve the issue

This is intentionally conservative. If the probe cannot confirm Node.js
readiness, the extension should not present a clickable init action.

## Proposed State Model

Add a distinct init-environment state to the extension model instead of
overloading `isInitialized`.

Recommended shape:

```ts
interface InitEnvironmentState {
  statusKind: 'checking' | 'ready' | 'missing' | 'unsupported' | 'error';
  requiredNodeRange: '>=22';
  detectedVersion: string | null;
  detectedPath: string | null;
  message: string;
  checkedAtMs: number | null;
}
```

Recommended additions to the summary view model:

```ts
interface ScanViewModel {
  ...
  initEnvironment: InitEnvironmentState;
  canRunBundledInit: boolean;
  showInstallNodeAction: boolean;
}
```

The summary setup card should render from this state, not from hard-coded text.

## Proposed Architecture

### 1. Add a small init-environment monitor

Create a new module such as `src/vscode/init-environment.ts`.

Responsibilities:

- probe for Node.js on the workspace host,
- normalize the result into `InitEnvironmentState`,
- serialize concurrent refreshes,
- ignore stale refresh results when a newer refresh starts,
- push state updates into the extension model.

This should stay separate from `OpenShrikeScanController`. Scan execution and
setup prerequisites are different concerns.

### 2. Keep the init command terminal-first

Do not rewrite `src/lib/init.ts` or the Ink UI.

Instead, change the VS Code command implementation so it launches a terminal
whose executable is the resolved Node.js binary and whose arguments point at the
bundled CLI entrypoint:

```text
<resolved-node> <extensionRoot>/dist/cli.js init
```

Using terminal creation with an explicit executable is preferred over creating a
shell and sending text because it avoids:

- PATH dependence for `shrike`,
- shell quoting issues for paths with spaces,
- cross-shell escaping differences.

### 3. Pass the extension root explicitly

The init terminal should set:

```text
OPENSHRIKE_TOOL_ROOT=<extensionRoot>
```

This keeps bundled asset discovery explicit for:

- `best_practices/`
- bundled OpenCode lookup under `node_modules/.bin`
- any future path resolution that depends on the installed extension layout

## Node.js Probe Design

The probe must not use the extension host's own Node runtime. It should verify
whether the workspace host can execute a Node binary that is suitable for the
terminal-based init flow.

Recommended behavior:

- prefer a shell-compatible probe rather than `process.version`,
- resolve the target shell from VS Code terminal settings where practical,
- fall back to the platform default shell if no explicit profile can be
  resolved,
- execute a small command that prints the executable path and version,
- parse the result and compare it against the required major version.

The probe result should capture:

- whether `node` could be resolved,
- the resolved executable path,
- the detected version string,
- whether the version satisfies `>=22`.

The implementation does not need to perfectly reproduce every custom terminal
profile on day one. It does need to avoid the false positive of treating the
extension host's own Node runtime as the terminal prerequisite.

## Refresh Triggers

The user asked for Node.js verification whenever the OpenShrike panel regains
focus. The implementation should refresh on these events:

- initial extension activation for the active workspace
- summary view resolution
- summary view visibility changes from hidden to visible
- VS Code window focus changes from unfocused to focused, but only when the
  summary view is currently visible
- immediately before running `openshrike.runInitInTerminal`
- after the user clicks `Install Node.js`

The refresh path should be debounced and revision-guarded so repeated focus
events do not race each other.

## Command Changes

### `openshrike.runInitInTerminal`

New behavior:

1. resolve the current workspace root,
2. force-refresh Node.js status,
3. if Node.js is not ready, show a guarded message and offer `Install Node.js`,
4. if Node.js is ready, create a terminal that launches the bundled CLI by
   absolute path.

Recommended terminal options:

- `name: 'OpenShrike Init'`
- `cwd: <workspaceRoot>`
- `shellPath: <resolvedNodePath>`
- `shellArgs: ['<extensionRoot>/dist/cli.js', 'init']`
- `env.OPENSHRIKE_TOOL_ROOT = <extensionRoot>`

### `openshrike.openNodeInstallPage`

New command used by the summary webview and optionally the command palette.

Behavior:

- open `https://nodejs.org/en/download`
- afterward, trigger a best-effort prerequisite refresh so the summary view can
  pick up a newly installed runtime when the user returns

## Summary View Changes

`renderInitializationPrompt(...)` should stop hard-coding a single clickable
`Run shrike init` link.

Instead it should render one of the state-specific variants described above.

Recommended rendering rules:

- use a command URI for `openshrike.runInitInTerminal` only when
  `canRunBundledInit === true`
- render a visually disabled non-link element for the blocked init action
- use a command URI for `openshrike.openNodeInstallPage` when
  `showInstallNodeAction === true`
- include a short Node.js status line below the copy

## Packaging Assumptions

This plan assumes the published VSIX continues to include:

- `dist/cli.js`
- the CLI's transitive production dependencies
- `best_practices/**`
- bundled `opencode-ai` artifacts required by the CLI/runtime

The feature does not work if the extension package contains only the VS Code
bundle and omits the CLI/runtime payloads.

## Testing Plan

### Unit tests

- view-model mapping for `ready`, `missing`, `unsupported`, `checking`, and
  `error`
- version gating for `21.x` rejected and `22.x` accepted
- command behavior when Node.js is blocked
- terminal launch configuration when Node.js is ready

### Integration or extension-host tests

- summary view updates after visibility regain
- summary view updates after window focus regain
- `Install Node.js` opens the external page command path
- `Run shrike init` launches the bundled CLI terminal instead of sending
  `shrike init`

### Manual coverage

- local Linux, macOS, and Windows
- remote WSL or SSH workspace
- missing Node.js
- Node.js `20.x`
- Node.js `22.x`
- workspace paths that contain spaces

## Risks and Tradeoffs

- Terminal-environment probing is inherently more complex than checking
  `process.version`.
- Remote workspaces can confuse users if the UI does not clearly say the
  requirement is on the workspace host.
- Opening the Node.js website is only a pointer, not an installation workflow.
- This improves the init path only. It does not by itself redesign the broader
  setup story for other external prerequisites.

## Recommended Rollout

Implement this as a narrow UX improvement first:

1. add the init-environment state and summary card variants,
2. add the Node.js probe and focus-triggered refresh,
3. change `openshrike.runInitInTerminal` to launch the bundled CLI,
4. add tests for the new guarded flow.

This gets the extension much closer to a clean first-run experience without
taking on a full init-webview rewrite.
