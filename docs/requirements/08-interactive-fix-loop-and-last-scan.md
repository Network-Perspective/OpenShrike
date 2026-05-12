# Interactive Fix Loop and Last-Scan State

## Goals
- Let an operator stay inside `shrike scan` and act on a selected finding
  immediately.
- Support two explicit actions from the scan UI: recheck the selected check or
  try to fix the selected failed check.
- Add a batch `shrike fix` workflow that fixes failing checks one by one and
  rechecks after each attempted fix.
- Keep scan and fix execution auditable and least-privilege by using separate
  agent identities and permission profiles.
- Persist the latest scan/fix report in a gitignored file under `.openshrike/`
  so the user can resume from saved findings.

## User-facing behavior

### `shrike scan` interactive actions
- Both list view and check detail view must expose `[R]echeck` and `[F]ix` for
  the currently selected check.
- `Recheck` reruns the currently selected completed check with the current scan
  selection, scope, runtime mode, and project-local check content.
- `Fix` is available only when the currently selected check is in `fail`
  status. For any other state, Shrike must show a short in-app message instead
  of attempting a fix.
- When a fix starts, the selected check must immediately display `fixing` status in
  the UI so the operator can tell that the fix agent is currently running for
  that check. the TUI indicator should be similar to `in progress` but different color (light blue?)
- After a fix attempt finishes, Shrike must automatically recheck that same
  check and replace the previous result with the new result.
- The UI must show a short status message for invalid actions such as:
  `Fix is only available for failed checks.` or `This check is already being fixed.`

### `shrike fix`
- `shrike fix` is a new command that fixes all currently failing checks one by
  one.
- The command must skip checks already in `pass` or `unknown`.
- For each failed check, the command flow is:
  1. mark the check as `fixing`,
  2. run the fix agent for that check,
  3. rerun that same check,
  4. persist the updated report,
  5. continue to the next remaining failed check.
- Exit codes should match `shrike scan`:
  - `0` when the final report has no failing checks,
  - `2` when failures remain,
  - `1` on command/runtime/config failure.

## Saved last-scan state
- Shrike must save the latest completed scan or fix report to a gitignored file
  under `.openshrike/`.
- The initial machine-readable state file name should be
  `.openshrike/last-scan.json`.
- Shrike must also write a human-readable Markdown snapshot at
  `.openshrike/last-scan.md`.
- The saved payload must include:
  - the report itself,
  - the resolved scan selection and scope used to produce it,
  - enough repository metadata to detect obvious staleness and warn the user.
- The Markdown snapshot must be a rendered human-readable view of the same
  report state and should include a short header with repository and scan
  context.
- `shrike scan --last-scan` must read the saved report instead of gathering a
  fresh scan.
- `shrike fix --last-scan` must read the saved report and fix the saved failing
  checks instead of rescanning first.
- `--last-scan` must use `.openshrike/last-scan.json` as the source of truth.
  `.openshrike/last-scan.md` is for review only and is not used to resume a
  session.
- When `--last-scan` is used, Shrike must fail clearly if the saved file is
  missing, unreadable, or incompatible with the current schema.
- Saved results must not be silently treated as fresh when the repository or
  selected checks have obviously changed. 

## Agent and permission requirements
- Scan and fix execution must use separate configured agents.
- The scan agent remains read-only.
- The fix agent is edit-capable and may use a different, more capable model.
- `shrike init` must surface both the scan model and the fix model, with the
  fix model allowed to differ from the scan model.
- `.openshrike/project.json` must store both scan defaults and fix defaults
  under `runtime.scanAgent`, `runtime.scanModel`, `runtime.fixAgent`, and
  `runtime.fixModel`.
- `.openshrike/opencode.json` must define both the read-only scan agent and the
  edit-capable fix agent with explicit permission blocks.

## Prompt requirements
- The fix prompt must include the selected check's Markdown content.
- The fix prompt must include the latest failing result for that check,
  including rationale, evidence, remediation, and version.
- The fix prompt must tell the agent to make the smallest repository change
  needed for the selected check and then stop.
- Recheck uses the normal evaluation flow; it does not reuse the fix prompt.

## Sequencing and safety requirements
- Fixes must never run in parallel with other fixes.
- A fix must run inside a live Shrike session, not as a detached follow-up
  after the scan command has already torn down its runtime.
- The implementation must preserve read-only guarantees for scan checks while
  still allowing a separate edit-capable fix session.
- Every completed fix attempt must be followed by an automatic recheck before
  Shrike reports the final state of that check.

## Initial scope boundaries
- The first implementation targets the `native` runtime path.
- Docker-based fixing is out of scope for this first pass because the current
  Docker review design assumes a read-only repository mount.
- Parallel or fully unattended multi-check fixing is out of scope.
- Automatic commits, branch management, and PR creation are out of scope.

## Notes
- The implementation plan lives in
  `docs/implementation/06-scan-fix-loop-plan.md`.
