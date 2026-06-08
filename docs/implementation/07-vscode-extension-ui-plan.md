# VS Code Extension UI Implementation Plan

Date: 2026-05-14

Status: proposed

Scope:

- new VS Code extension presentation layer for `shrike scan`
- integrated-terminal handoff for `shrike init`
- findings browser with evidence-to-code navigation
- extension build, packaging, and test coverage

Primary files expected to change or be added during implementation:

- `package.json`
- `tsconfig.json` or split TS configs
- `src/lib/scan.ts`
- `src/lib/last-scan.ts`
- `src/ui/scan-app.tsx`
- new `src/lib/evidence.ts`
- new `src/vscode/**`
- tests covering scan-state mapping and extension behavior

## Why this can be simpler than the original plan

The original design assumed the extension would replace both major interactive
terminal experiences:

- `shrike init`
- the full `scan` plus `recheck`/`fix` loop

That required large refactors:

- extracting the init state machine behind a new UI adapter,
- extracting a shared scan controller for fix/recheck actions,
- moving the Ink TUI onto the shared controller before the extension work.

The revised scope is intentionally narrower:

- `shrike init` stays terminal-first,
- the extension focuses on scan execution and findings presentation,
- interactive fix/recheck stays in the CLI/TUI for now.

That means we can avoid the largest structural refactors and build the
extension on top of the existing scan/reporting core with a much thinner
integration layer.

## Decision record

- The extension will call shared scan/reporting modules in-process. We will not
  build it as a CLI subprocess wrapper for `shrike scan`.
- The extension will offer `OpenShrike: Run Init In Terminal` as a convenience
  handoff, not as a reimplementation of the `init` wizard.
- The initial extension version will not implement in-editor `Recheck`, `Fix`,
  or `Fix All Failing Checks`.
- We will keep the existing Ink TUI and CLI behavior unchanged unless a small
  extraction directly improves scan/findings reuse.
- We will invest primarily in evidence navigation and findings presentation
  rather than duplicating terminal interactions inside webviews.
- The minimum supported VS Code version for the extension will be `1.101`.
  Compatibility with older VS Code versions is out of scope for the initial
  release.
- The extension will be a workspace extension and should declare
  `extensionKind: ["workspace"]`.
- The extension will ship its own `opencode-ai` runtime and required platform
  binary. Users must not need a separate global `opencode` install.
- The extension will resolve bundled assets and runtime executables relative to
  the installed extension root. It must not rely on `cwd`, PATH lookup, or
  CLI-era filesystem discovery heuristics.
- OpenShrike will publish platform-specific VSIX packages instead of one
  universal package that carries every supported native `opencode` payload.
- Scan cancellation is a required initial-version feature. It must be planned
  into the shared scan/session design from the start rather than deferred.

## Recommended architecture

### 1. Keep `src/lib/**` as the execution layer

The existing `src/lib/**` modules remain the source of truth for:

- config and project discovery,
- runtime config parsing,
- scan execution,
- last-scan persistence,
- report rendering,
- check definition and title reads.

This layer should continue to know nothing about VS Code APIs.

However, we should stop baking CLI install-layout assumptions into shared
helpers. Path discovery for bundled assets and runtime executables should move
behind explicit resolvers so:

- the CLI can continue to use the tool/repo root,
- the extension can pass its installed extension root,
- shared scan/report modules do not guess based on `cwd` or PATH.

### 2. Do not refactor `shrike init` into an editor flow

For the initial extension version, `shrike init` remains exactly what it is
today: a terminal-driven Ink experience.

The extension only needs a small command that:

- resolves the selected workspace/repo root,
- creates or reuses an integrated terminal with that `cwd`,
- runs `shrike init`,
- tells the user to return to the OpenShrike view and run a scan afterward.

Recommended implementation shape:

- `OpenShrike: Run Init In Terminal`
- VS Code API usage equivalent to:
  - `vscode.window.createTerminal({cwd: repoRoot})`
  - `terminal.show()`
  - `terminal.sendText('shrike init', true)`

This gives the user the right workflow without forcing a redesign of the init
state machine.

### 3. Add a thin extension-side scan session wrapper

The extension still needs one small orchestration layer, but it can be much
lighter than the previously proposed shared controller.

Recommended responsibilities:

- resolve the target workspace/repo,
- call `resolveScanOptions(...)` and `runScan(...)`,
- subscribe to progress/runtime events,
- map those events into extension view state,
- expose cancel/cancelling/cancelled state for the active run,
- propagate cancellation into the shared scan execution path,
- persist last-scan artifacts after completion,
- load `.openshrike/last-scan.json` when requested,
- expose a stable in-memory state model for tree/detail views.

This wrapper can live under `src/vscode/scan-session.ts` rather than forcing a
new shared `src/app/**` layer up front.

Recommended shape:

```ts
interface VscodeScanSession {
  getState(): VscodeScanState;
  subscribe(listener: (state: VscodeScanState) => void): () => void;
  run(options?: Partial<ScanCommandOptions>): Promise<ScanReport>;
  cancel(): Promise<void>;
  loadLastScan(): Promise<void>;
  dispose(): void;
}
```

This is enough for the initial extension because:

- `runScan(...)` already emits progress hooks,
- last-scan persistence already exists,
- recheck/fix action orchestration is out of scope.

Cancellation notes:

- the wrapper must distinguish cancellation from runtime/configuration failure,
- the UI state model should include `idle`, `running`, `cancelling`,
  `completed`, `cancelled`, and `failed` or an equivalent shape,
- we should avoid treating cancellation as a generic error path in the UI.

### 4. Extract evidence helpers from `scan-app.tsx`

The current TUI owns useful logic for turning evidence text into navigable file
locations and previews. That logic should move into a shared helper module such
as `src/lib/evidence.ts`.

Shared helpers should cover:

- parse evidence text into file/line locations when possible,
- build display labels for UI presentation,
- optionally load surrounding file lines for preview snippets.

This supports both:

- the VS Code detail pane with clickable evidence links,
- the existing TUI if we later choose to simplify `scan-app.tsx`.

### 5. Add the VS Code extension host under `src/vscode/**`

Recommended modules:

- `src/vscode/extension.ts`
  - extension activation and disposal
- `src/vscode/workspace-target.ts`
  - resolve the active repo/workspace folder and handle multi-root prompts
- `src/vscode/scan-session.ts`
  - own the active scan state for one workspace
- `src/vscode/commands/*.ts`
  - `run-init-terminal`
  - `run-scan`
  - `run-scan-with-overrides`
  - `cancel-scan`
  - `load-last-scan`
  - `open-check`
  - `open-evidence`
  - `open-last-scan`
- `src/vscode/views/check-tree.ts`
  - tree view provider for grouped findings and summary rows
- `src/vscode/views/detail-view.ts`
  - detail presentation for the selected finding
- `src/vscode/status-bar.ts`
  - active scan summary
- `src/vscode/output-channel.ts`
  - structured routing of runtime/status messages into one output channel
- `src/vscode/scan-overrides.ts`
  - one-off scan option prompt flow

Initial UI mapping:

- Activity Bar container: `OpenShrike`
- tree view for grouped findings
- detail view for the selected finding
- output channel for runtime/status logs
- status bar item for active progress
- command palette and tree/context actions for user commands

### 6. Keep the TUI unchanged in the first pass

The existing Ink TUI should stay on its current code path during the initial
extension work.

Reasons:

- the extension no longer needs parity for fix/recheck actions,
- `runScanWithInk(...)` already works,
- avoiding a TUI refactor reduces delivery risk.

If later we bring the fix loop into the extension, that is the right moment to
revisit a broader shared controller.

## Build and packaging plan

### Separate the CLI build target from the extension build target

The CLI currently targets Node 22 and emits `dist/cli.js`. The extension host
should get its own build target and entrypoint so we do not assume the CLI
runtime target is identical to the VS Code extension host baseline.

Recommended build changes:

- keep the CLI bundle as-is,
- add a dedicated extension entry bundle,
- use a separate TS/bundler target for the extension host,
- keep shared sources in `src/lib/**`,
- avoid changing CLI runtime semantics just to satisfy VS Code packaging.

Extension baseline decisions:

- target VS Code `1.101+`,
- assume Node 22 in supported desktop and remote extension hosts,
- do not spend effort preserving compatibility with VS Code `1.100` and older.

### Package assets and runtime explicitly

The extension must preserve the data and runtime dependencies that the CLI
expects today, but it should do so with explicit extension-relative resolution
instead of implicit repo-relative discovery.

Recommended packaging rules:

- ship `best_practices/**` in the VSIX,
- ship `opencode-ai` and the matching platform-specific native package in the
  VSIX,
- derive the extension install root from the VS Code activation context,
- resolve bundled checks/policies relative to that extension root,
- resolve the bundled `opencode` launcher via an absolute path under the
  extension root instead of `spawn('opencode', ...)`,
- avoid mutating PATH just to find bundled runtime binaries.

Preferred runtime launch shape:

- resolve `<extensionRoot>/node_modules/opencode-ai/bin/opencode`,
- execute that launcher explicitly, for example via `process.execPath`,
- let the packaged `opencode-ai` wrapper locate the matching native
  `opencode-*` dependency under the installed extension tree.

This keeps the extension install self-contained and removes any requirement for
user-installed global tooling.

### Prefer platform-specific VSIX builds

OpenShrike should publish platform-specific VSIX packages instead of one larger
package that carries every supported native `opencode` payload.

Reasons:

- smaller extension installs,
- clearer host/architecture matching for workspace extensions in SSH, WSL,
  devcontainer, and Codespaces scenarios,
- no need to ship unrelated native binaries to every user.

Recommended initial target set:

- `win32-x64`
- `win32-arm64`
- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`

Alpine-specific targets can be added later if real remote-host demand justifies
them.

### Webview strategy

The initial version should avoid a large frontend stack. A simple detail view
with HTML plus message passing is enough for:

- summary metadata,
- rationale,
- remediation,
- clickable evidence items,
- actions such as `Open check markdown`.

If the detail pane later needs richer interaction, we can revisit a larger
webview frontend then.

## Test strategy

### Shared helper tests

Add unit tests for:

- evidence parsing,
- evidence location normalization,
- scan-state mapping from progress events into extension view state,
- running/cancelling/cancelled state transitions,
- last-scan load and warning presentation helpers.

### Extension tests

Add extension-host tests for:

- command registration,
- workspace target resolution,
- `Run Init In Terminal` terminal creation and command dispatch,
- cancel command/status-bar action wiring for an active scan,
- bundled asset-root resolution from the installed extension path,
- bundled `opencode` launcher resolution for the active target platform,
- tree refresh on scan updates,
- detail view selection updates,
- evidence navigation into editors,
- load-last-scan warning surfacing.

## Phase plan

### Phase 1. Extract evidence helpers and define extension state

Deliverables:

- new `src/lib/evidence.ts` or equivalent
- extension-side state model for summary rows, grouped findings, and selected
  detail content
- state model coverage for running/cancelling/cancelled scan lifecycle
- tests for evidence parsing and state mapping

Exit criteria:

- evidence parsing logic is reusable outside the TUI,
- the future extension detail pane has a stable data shape to consume,
- cancellation-related UI state is represented explicitly instead of being an
  afterthought bolted onto a completed/failed-only model.

### Phase 2. Scaffold the extension host and terminal init handoff

Deliverables:

- extension activation entrypoint
- workspace target resolution
- extension asset-root and runtime-path resolvers
- output channel and status bar wiring
- `OpenShrike: Run Init In Terminal`

Exit criteria:

- the extension can open a terminal at the correct repo root and run
  `shrike init`,
- the extension can resolve bundled assets and the bundled `opencode` launcher
  from the installed extension layout,
- no init-flow refactor is required.

### Phase 3. Implement scan execution and findings views

Deliverables:

- `run-scan` and `run-scan-with-overrides` commands
- `cancel-scan` command plus in-UI cancel affordances
- extension-side scan session wrapper
- tree view for grouped findings
- detail view for selected findings
- clickable evidence links into code

Exit criteria:

- a user can run a scan from VS Code,
- a user can cancel an active scan from the command palette or active scan UI,
- progress is visible during execution,
- cancelling and cancelled states are visible and distinct from failed state,
- findings are inspectable without leaving the editor,
- evidence navigation works for parseable file/line locations.

### Phase 4. Implement last-scan loading and polish

Deliverables:

- `load-last-scan` command
- stale-state warning presentation
- `open-last-scan` command
- packaging/build cleanup
- extension-host tests

Exit criteria:

- a user can inspect saved findings from `.openshrike/last-scan.json`,
- the extension install/build story is clear,
- known gaps are explicit.

## Risks and open questions

### 1. Extension-host baseline is fixed, but packaged-layout validation remains

The extension will target VS Code `1.101+`, so compatibility with older VS
Code releases is out of scope. We can assume Node 22 in supported desktop and
remote extension hosts.

The remaining risk is not language-level Node compatibility. It is validating
that shared scan/report modules work correctly when bundled assets and runtime
executables are resolved from the installed extension layout on each supported
target platform.

### 2. Evidence precision is only as good as the evidence format

Some findings include precise file/line locations; others may only contain raw
text. The extension should degrade gracefully:

- clickable links when locations are parseable,
- readable raw evidence when they are not.

### 3. Terminal init completion detection is optional

The extension can launch `shrike init` reliably, but it does not need to parse
or orchestrate the terminal flow. Automatic post-init refresh can be added
later if it is cheap; it is not required for the first implementation.

### 4. Scan cancellation semantics must be designed early

Cancellation is a required initial-version feature, so we need to make the
shared scan/session lifecycle cancellation-aware up front.

Open questions:

- how native-runtime cancellation should propagate to active OpenCode sessions
  and child processes,
- how docker-runtime cancellation should terminate containers and clean up
  temporary artifacts,
- whether cancelled runs should persist any last-scan artifacts, and if so,
  how partial results are labeled to avoid looking like a complete report.

### 5. Target-platform coverage still needs an explicit release matrix

We have decided to prefer platform-specific VSIX packages. The remaining work
is operational:

- define the exact CI build/publish matrix,
- verify packaging for each supported host/architecture pair,
- decide later whether Alpine variants are required.

## Recommended next step

Start with Phase 1 and Phase 2 together, plus a narrow packaging spike that
proves four things on one supported target platform:

- extension-relative bundled asset resolution,
- bundled `opencode` launcher resolution,
- a scan entrypoint running from the extension host in `mockOpencode` mode,
- a basic start/cancel lifecycle for an in-progress scan.

That gives a concrete vertical slice without forcing premature refactors in the
existing TUI or init flow, and it validates the packaging assumptions before we
spread UI work across multiple views.
