# Scan Fix Loop Implementation Plan

Status: proposed

Scope:

- `shrike scan` UI actions
- new `shrike fix` command
- `.openshrike/project.json`
- `.openshrike/opencode.json`
- `shrike init`
- saved last-scan state under `.openshrike/`

Primary files expected to change during implementation:

- `.gitignore`
- `src/cli.ts`
- `src/commands/scan.ts`
- `src/lib/scan.ts`
- `src/lib/scan-options.ts`
- `src/lib/types.ts`
- `src/lib/config.ts`
- `src/lib/constants.ts`
- `src/lib/markdown.ts`
- `src/lib/project-config.ts`
- `src/lib/init.ts`
- `src/lib/init/write.ts`
- `src/ui/scan-app.tsx`
- `tests/*scan*`
- `tests/config.test.ts`
- `tests/init-flow.test.ts`

## Why this needs a structural change

The current implementation assumes that `shrike scan` is a one-shot operation:

- `runScanWithInk()` starts `runScan()` and only observes progress.
- `runScan()` resolves a fixed check list, starts workers, and returns one final
  `ScanReport`.
- `evaluateCheckWithRecovery()` wraps each evaluation in
  `RepoMutationGuard`, which treats any repository write as a fatal error.
- Repo-local Shrike config stores one runtime agent/model pair, not separate
  scan and fix identities.

That model is sufficient for read-only review, but it cannot support:

- on-demand `Recheck`,
- on-demand `Fix`,
- a write-capable agent,
- `shrike fix`,
- or loading a saved report and continuing from it.

## Proposed design

## Decision record

- We will implement `shrike fix` as a live session feature that shares the same
  runtime lifecycle as `shrike scan`, rather than as a detached follow-up job.
  This keeps the fix agent inside the same operator session so fixes can be
  applied, rechecked, and persisted without losing state.
- We will persist the latest completed report to `.openshrike/last-scan.json`
  and `.openshrike/last-scan.md` so operators can resume from the last known
  findings without rerunning the scan first.
- We will start with the `native` runtime path for fixing because Docker-based
  fixing still assumes a read-only repository mount; supporting write-capable
  fixes there would require a larger isolation redesign.
- We will keep separate scan and fix agents/models so read-only review settings
  stay strict while the fix path can use a distinct edit-capable profile.

Alternatives considered:

- Detached background fix jobs: rejected because they would outlive the live
  session state and make recheck/persistence coordination harder.
- Storing only the Markdown snapshot: rejected because the JSON payload is the
  authoritative resume source and the Markdown view is for inspection only.
- Enabling Docker fixes in the first pass: rejected because the current Docker
  design intentionally keeps the repository mount read-only.

### 1. Introduce a session/controller layer for scan state

Add a long-lived controller around scan execution rather than letting the UI
talk only to `runScan()`:

- `createScanSession(options)` or equivalent returns an object that:
  - starts the scan,
  - streams progress/runtime events,
  - exposes `requestRecheck(checkId)`,
  - exposes `requestFix(checkId)`,
  - exposes current session state snapshots,
  - returns a final report when all work is done.

The session state should track:

- the original check order,
- completed results by check id,
- running read-only checks,
- a single active fix operation,
- transient UI state such as `fixing` or `rechecking`,
- short operator-facing messages,
- the latest persisted last-scan payload.

This is the main prerequisite for both the UI actions and the batch `fix`
command.

### 2. Split execution into read-only scan jobs and exclusive fix jobs

Keep two execution modes inside the same Shrike session:

- read-only check evaluation jobs,
- exclusive fix jobs that mutate the repository and then recheck.

The session should use these rules:

- Normal scan checks may still use the existing worker pool and current
  parallelism logic.
- Rechecks are read-only jobs. They may run only when that target check is not
  already pending/running/fixing.
- Fix jobs require an exclusive mutex.
- Before a fix job starts, the session should stop dispatching new read-only
  jobs and wait for in-flight read-only checks to drain.
- After the fix attempt and automatic recheck complete, the session can resume
  dispatching remaining read-only checks.

This is the pragmatic interpretation of "fix while scan is running": the fix
must happen during the lifetime of the active `shrike scan` or `shrike fix`
process and its live runtime, but it should not mutate the repository while
other read-only checks are still executing against the same worktree.

### 3. Keep read-only guardrails for scan, add a separate fix path

Do not weaken `RepoMutationGuard` for scan evaluation.

Instead:

- scan and recheck keep the current read-only guard,
- fix uses a separate code path that intentionally allows repository edits,
- fix still relies on an explicit OpenCode permission profile and Shrike-owned
  agent selection,
- fix remains single-threaded.

The implementation should avoid mixing the two paths in one helper. A dedicated
`runFixForCheck()` path is easier to reason about than threading a boolean
through the current evaluator and guard flow.

### 4. Add explicit scan and fix agent defaults

Replace the persisted `project.json` runtime field names so the config uses the
scan/fix distinction explicitly.

Planned `project.json` runtime shape:

```json
{
  "runtime": {
    "configPath": ".openshrike/opencode.json",
    "scanAgent": "shrike-checker",
    "scanModel": "azure/gpt-5.4-mini",
    "fixAgent": "shrike-fixer",
    "fixModel": "azure/gpt-5.4",
    "mode": "native",
    "parallelism": "auto"
  }
}
```

Semantics:

- `scanAgent` and `scanModel` remain the scan defaults.
- `fixAgent` and `fixModel` are fix defaults.

Planned `opencode.json` shape:

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
    },
    "shrike-fixer": {
      "description": "Fixes a single OpenShrike finding and may edit repository files.",
      "model": "azure/gpt-5.4",
      "permission": {
        "bash": "allow",
        "edit": "allow",
        "webfetch": "deny",
        "doom_loop": "deny",
        "external_directory": "deny"
      }
    }
  }
}
```

Implementation notes:

- add a new default constant for the fix agent name,
- update the project-config schema and init writer to emit `scanAgent` /
  `scanModel` instead of `agent` / `model`,
- keep `scan` command CLI flags as `--agent` / `--model` for now; they are
  per-command overrides and do not need to mirror the persisted field names,
- replace `ensureShrikeAgent()` with helper logic that guarantees both agents,
- keep the top-level `model` aligned with the scan default to minimize drift in
  existing behavior.

### 5. Extend `shrike init`

`shrike init` currently selects one default model. The new flow should add a
second fix-model choice without making setup noisy.

Recommended flow:

1. choose the scan model,
2. choose the fix model (suggest more capable model)
3. if different, show the same model selector again for the fix model,
4. write both values to `.openshrike/project.json` and
   `.openshrike/opencode.json`.

This keeps the common path fast while still supporting the explicit
"stronger fix model" requirement.

### 6. Persist the latest scan state

Add dedicated saved-state artifacts:

- `.openshrike/last-scan.json`
- `.openshrike/last-scan.md`
- both gitignored later in implementation

`last-scan.json` is the authoritative resume/recheck/fix state.

Recommended JSON payload shape:

```json
{
  "version": 1,
  "savedAt": "2026-05-12T12:00:00.000Z",
  "repo": {
    "path": "/abs/repo",
    "head": "abc123",
    "dirty": true
  },
  "request": {
    "checkId": null,
    "policyId": null,
    "projectChecksDir": "/abs/repo/.openshrike/checks",
    "scanScope": "uncommitted",
    "scanTarget": null,
    "runtimeMode": "native"
  },
  "report": {
    "...": "existing ScanReport payload"
  }
}
```

Rules:

- write both files after every completed scan,
- rewrite both files after every fix/recheck step,
- load only `last-scan.json` for `scan --last-scan` and `fix --last-scan`,
- validate schema version before use,
- warn when repo metadata no longer matches.

This payload should store the resolved request, not only the rendered report,
because recheck/fix needs to reconstruct the original selection.

`last-scan.md` should be derived from the same state and should contain:

- a short generated header with `savedAt`, repo path, selection, and scope,
- the rendered Markdown report body for the saved `ScanReport`,
- a short note that JSON is the source of truth for resume flows.

Markdown rendering failure should not invalidate an already-written JSON state;
Shrike should preserve the JSON file and warn about the Markdown artifact
failure separately.

### 7. Add `--last-scan` to `scan`

`scan --last-scan` should:

- locate and load `.openshrike/last-scan.json`,
- ignore `.openshrike/last-scan.md` except as a user-visible artifact,
- print the saved report directly when UI is disabled,
- open the UI with the saved report when UI is enabled,
- avoid launching a full fresh scan unless the user explicitly rechecks or
  fixes from the UI.

This implies lazy runtime creation in the UI path when the command starts from a
saved report.

### 8. Add a new `shrike fix` command

The new command should reuse scan option resolution as much as possible.

Command behavior:

- without `--last-scan`:
  - resolve selection exactly like `scan`,
  - gather an initial report,
  - fix failing checks sequentially,
  - print the final report.
- with `--last-scan`:
  - load the saved report and saved request,
  - fix only the saved failing checks,
  - print the final updated report.

CLI rules:

- `--last-scan` should be mutually exclusive with fresh-selection flags that
  would otherwise redefine the saved request.
- output and exit-code behavior should mirror `scan`.

### 9. Add UI support in `src/ui/scan-app.tsx`

Planned UI changes:

- extend `CheckDisplayStatus` with `fixing` status
- add keyboard handlers for `r` and `f`,
- surface a short-lived status/message line in the footer or summary area,
- update help text and detail/list affordances,
- allow the view to start from a saved report with no active full-scan worker
  pool,
- keep the selected row stable when a check transitions through
  `fail -> fixing -> running -> pass/fail/unknown`.

The public report schema does not need a new persisted check status for this
first pass. `running`, `fixing` can remain session-local UI state.

### 10. Add a fix prompt builder

Create a dedicated prompt builder for fixing a single check.

The prompt should include:

- the full Markdown content of the selected check,
- the current failed result for that check,
- the current repo path and applicable scan scope summary,
- instructions to make the smallest change needed,
- instructions not to address unrelated checks opportunistically.

The fix path should use the fix agent/model from config, not the scan agent.

### 11. Limit the first implementation to native runtime

Do not broaden the Docker runtime in the same change.

Reason:

- current Docker design assumes a read-only repo mount,
- current security docs frame Docker as the hardened read-only path,
- writable Docker fixing requires a separate workspace/writeback design.

UI/CLI behavior in Docker mode for this first pass should be explicit:

- either hide/disable `Fix`,
- or show a clear message that fix is currently supported only in native mode.

## Suggested implementation order

1. Extend config schemas and defaults for `fixAgent` and `fixModel`.
2. Rename persisted scan defaults from `agent` / `model` to
   `scanAgent` / `scanModel`.
3. Extend `shrike init` write path and prompts.
4. Add saved last-scan schema, JSON writer/reader, and Markdown artifact writer.
5. Update `.gitignore` for the new saved-state artifacts.
6. Introduce the scan session/controller abstraction.
7. Add exclusive fix execution and automatic recheck.
8. Wire `r` / `f` into the Ink UI.
9. Add `shrike fix`.
10. Add Docker-mode guardrails and clear unsupported-path messaging.

## Test plan

- Config tests:
  - new config loads with `runtime.scanAgent` / `runtime.scanModel`,
  - init writes both scan and fix defaults,
  - runtime config emits both agents with correct permissions.
- Saved-state tests:
  - valid last-scan file loads,
  - `last-scan.md` is written from the same saved state,
  - missing/incompatible file fails clearly,
  - stale metadata produces a warning.
- Scan session tests:
  - recheck reruns only the selected check,
  - fix drains running read-only jobs before editing,
  - only one fix runs at a time,
  - fix automatically rechecks the same check.
- UI tests:
  - list/detail both accept `r` and `f`,
  - pass/unknown/pending/running/fixing show the expected fix rejection
    message,
  - fixing state renders with a dedicated `FIXING` status distinct from
    `running`.
- CLI tests:
  - `shrike fix` returns `0/2/1` correctly,
  - `scan --last-scan` and `fix --last-scan` use saved state instead of
    rescanning.

## Follow-up work kept out of this change

- Docker-native fixing with a writable workspace and controlled writeback.
- Multi-fix queueing from the interactive UI.
- Automatic commit creation after a successful fix run.
- Resume/retry UX beyond the saved report file itself.
