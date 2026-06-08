# VS Code Extension UI

Date: 2026-05-14

Status: proposed

## Summary

OpenShrike already has a CLI plus an Ink TUI for `shrike init` and the
interactive `scan`/`fix` loop. The goal of this work is to add a VS Code
extension focused on `shrike scan` and findings presentation inside the editor
while reusing the existing TypeScript runtime, config, saved-state, and
security model.

This extension is a new presentation layer over the current project internals.
It is not a second implementation of scan logic, and it is not a CLI wrapper
that shells out to `shrike scan` and parses terminal output. `shrike init`
remains terminal-first in the initial version.

## Goals

- Provide a first-class VS Code UI for `shrike scan`, findings inspection, and
  `--last-scan`.
- Provide a convenience command that launches `shrike init` in an integrated
  terminal at the selected workspace root.
- Reuse the existing TypeScript internals for config discovery, scan
  execution, saved state, report rendering, and runtime events.
- Preserve repo-local Shrike state as the source of truth:
  `.openshrike/project.json`, `.openshrike/opencode.json`,
  `.openshrike/checks/`, and `.openshrike/last-scan.*`.
- Improve local developer ergonomics by making findings and evidence navigable
  without leaving VS Code.
- Keep the CLI as the automation and CI surface without regressing current
  terminal workflows.

## Non-goals

- Replacing the CLI for CI, machine-readable output, or internal worker
  commands.
- Building a browser-only/web extension for `vscode.dev`.
- Adding a new backend service, daemon, or network API.
- Introducing a second config model or extension-owned copy of project/runtime
  settings.
- Relaxing the current scan/fix permission model.
- Replacing the existing terminal-driven `shrike init` flow with an editor
  wizard in the initial version.
- Bringing the interactive `Recheck`, `Fix`, or batch `shrike fix` loop into
  the extension in the initial version.

## Product principles

- Same engine, different UI: the extension must call shared core modules
  directly rather than spawning `shrike` and parsing stdout/stderr.
- Workspace-first: the extension operates on the selected repository/workspace
  folder and uses the same repo-root discovery rules as the CLI.
- Native VS Code surfaces: use commands, tree views, output channels, status
  bar items, editors, and webviews where they fit instead of recreating a
  terminal application inside a webview.
- Project config over editor settings: behavioral defaults stay in
  `.openshrike/project.json`; VS Code settings are only for presentation
  preferences.
- Security parity: the extension preserves the same runtime mode behavior,
  agent separation, saved-state schema, and permission model.

## Primary workflows

### 1. Initialize a workspace

- The extension must expose `OpenShrike: Run Init In Terminal`.
- When invoked, the extension should create or reveal an integrated terminal at
  the selected workspace/repo root and run `shrike init`.
- The extension does not need to replicate or parse the TUI steps from
  `shrike init`.
- If scan commands are invoked before the workspace is initialized, the
  extension should surface a clear message and offer `Run Init In Terminal`.
- After terminal init completes, the extension may offer a lightweight refresh
  or simply instruct the user to run `OpenShrike: Run Scan`.

### 2. Run a scan

- The extension must expose:
  - `OpenShrike: Run Scan`
  - `OpenShrike: Run Scan With Overrides`
  - `OpenShrike: Cancel Scan`
  - `OpenShrike: Load Last Scan`
- `Run Scan` uses the same saved defaults the CLI uses after `shrike init`.
- `Run Scan With Overrides` must support one-off overrides for:
  - selection: project checks, policy, or single check,
  - scan scope and scan target,
  - runtime mode,
  - parallelism,
  - mock runtime.
- The UI must display live scan progress:
  - scope label,
  - counts for pass/fail/inconclusive,
  - total/completed/running checks,
  - runtime mode and parallelism,
  - current status/detail lines,
  - token usage totals when available.
- The UI must provide a visible cancel/stop action while a scan is active.
- When a scan is cancelled, the extension must show a distinct cancelling and
  cancelled state instead of reporting the run as a successful completion.
- Partial results from a cancelled scan may be shown in-session, but they must
  be clearly marked as partial/cancelled.
- A completed scan must write the same last-scan artifacts as the CLI.

### 3. Inspect findings

- The extension must provide a persistent view of scan state and findings inside
  VS Code.
- Findings must be grouped by status: failed, inconclusive, passed.
- Selecting a finding must show:
  - check id and title,
  - status and confidence,
  - rationale,
  - remediation,
  - evidence list,
  - actions for `Open check markdown` and `Open evidence`.
- Evidence entries with parseable file/line locations must open the correct
  document and reveal the referenced lines.
- Evidence entries with parseable file/line locations should be rendered as
  clickable links in the detail presentation rather than raw text only.
- Evidence entries without parseable locations must still be visible as raw
  text.

### 4. Code navigation and evidence links

- The extension should optimize for navigating from findings into the relevant
  repository context.
- At minimum, the user must be able to:
  - open the source file referenced by an evidence item,
  - reveal the referenced line range when available,
  - open the Markdown definition for the selected check,
  - keep the selected finding visible while opening related code.
- The extension may later add richer navigation such as peek views or editor
  decorations, but those are not required for the initial version.

### 5. Resume from last scan

- `OpenShrike: Load Last Scan` must read the same `.openshrike/last-scan.json`
  schema used by the CLI.
- The UI must surface stale-state warnings returned by
  `loadLastScanState(...)`.
- The user must be able to open the generated `.openshrike/last-scan.md`
  snapshot from the UI.

### 6. Logs, notifications, and status

- The extension must provide:
  - an output channel for Shrike runtime/status messages,
  - progress notifications for long-running operations,
  - a status bar item summarizing active scan state and offering cancellation
    while a scan is active,
  - clear error notifications with actionable next steps when
    configuration/runtime failures occur.
- Runtime event logging must reuse the existing structured event data rather
  than inventing a second log format.

## UI shape

### Recommended surfaces

- Activity Bar view container: `OpenShrike`
- Tree view: scan summary and grouped findings
- Detail view: selected check details and actions
- Output channel: `OpenShrike`
- Status bar item: current scan status
- Command palette entry points for all major actions

### Multi-root behavior

- The initial version must support multi-root workspaces by prompting the user
  to choose the target workspace folder when the repo is ambiguous.
- Aggregated multi-repo dashboards are out of scope.

## Configuration and persistence requirements

- `.openshrike/project.json` and `.openshrike/opencode.json` remain the only
  source of truth for runtime defaults.
- The extension may add VS Code settings only for presentation concerns such
  as:
  - auto-reveal details,
  - auto-open the output channel on failure,
  - show/hide the status bar item.
- The extension must not fork or rewrite saved-state/report schemas for UI
  convenience.
- Any extension cache must be disposable and derivable from canonical
  repo-local state.

## Security and runtime requirements

- The extension must preserve current scan/fix agent separation and permission
  profiles.
- It must not add a new runtime path beyond existing `native` and `docker`.
- It must not bypass `loadRuntimeConfig(...)`, `buildDefaultOpencodeConfig(...)`,
  or repo-local config writes.
- It must not silently downgrade errors or warnings that the CLI currently
  surfaces.
- No telemetry or remote service dependency is required for the initial
  version.

## Initial scope boundaries

- Supported host: desktop VS Code and remote extension hosts where Node,
  filesystem access, child processes, and Docker access when selected are
  available.
- Unsupported host: browser-only/web extensions.
- `shrike init` remains terminal-first and is launched from the extension only
  as a convenience handoff.
- Interactive `Recheck`, `Fix`, and `Fix All Failing Checks` remain in the
  CLI/TUI for the initial extension version.
- CLI-only features that do not need a first-class UI in the initial version:
  - raw `--output json|markdown`,
  - `--emit-bundle`,
  - internal worker commands.
- The extension is an alternative to the TUI and local interactive flows, not
  a replacement for CI automation.

## Notes

- This extension depends directly on the existing scan/runtime requirements,
  especially `docs/requirements/04-agent-runtime.md` and
  `docs/requirements/07-workflows-and-integrations.md`.
- The implementation plan lives in
  `docs/implementation/07-vscode-extension-ui-plan.md`.
