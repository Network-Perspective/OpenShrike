# Domain-Batched Scan Execution Plan

Date: 2026-06-17

Status: proposed

## Goal

Reduce scan token usage by sending multiple same-domain checks to OpenCode in a
single prompt, while keeping the final scan report and operator workflows
check-oriented.

This change must cover all scan surfaces that rely on the shared scan engine:

- plain CLI scans,
- the Ink TUI runner used by `shrike scan` / `shrike fix`,
- the VS Code runner,
- native and Docker runtime modes.

## Why this needs a structural change

The current scan pipeline is hard-wired to "one OpenCode prompt per check":

- `src/lib/scan.ts` resolves a flat `checkIds` list and schedules one worker job
  per check.
- `src/lib/evaluator.ts` reads one check definition, builds one prompt, and
  validates one JSON object result.
- `prompts/scan-system.md` explicitly tells the agent to evaluate exactly one
  best-practice check at a time.
- `src/lib/runtime.ts` associates one runtime session with one `checkId`.
- TUI and VS Code progress models assume that one active runtime session maps to
  one running check.

That model wastes tokens because every check repeats the same scope section,
scope evidence, repo path, output contract, and general instructions. It also
creates more OpenCode sessions than necessary.

## Decision record

- Batch only the initial scan pass.
- Keep `requestRecheck(checkId)` and `requestFix(checkId)` as single-check
  operations.
- Group checks by frontmatter `domain`.
- If `domain` frontmatter is missing, infer the domain from the check filename
  or id by taking the prefix before the numeric segment, for example
  `bp-api-001-machine-readable-error-contracts` -> `bp-api`.
- Preserve the existing `ScanReport` shape: final results remain one
  `CheckResult` per check.
- Treat checks as singleton batches only when neither frontmatter nor filename
  inference yields a usable domain.
- Add deterministic split heuristics so a large `rel` or `sec` selection does
  not become one oversized prompt.
- Implement batching in the shared scan layer rather than separately in TUI or
  VS Code, so both runners inherit the same behavior.

Non-goals:

- changing `bundle_id` semantics,
- batching fix operations,
- changing the persisted last-scan JSON schema unless new transient metadata is
  truly required,
- changing report consumers to a batch-oriented result model.

## Primary files expected to change

- `prompts/scan-system.md`
- `src/lib/checks.ts`
- `src/lib/evaluator.ts`
- `src/lib/runtime.ts`
- `src/lib/types.ts`
- `src/lib/scan.ts`
- `src/lib/docker-protocol.ts`
- `src/ui/scan-app.tsx`
- `src/vscode/scan-controller.ts`
- `tests/checks.test.ts`
- `tests/evaluator.test.ts`
- `tests/scan.test.ts`
- `tests/scan-session.test.ts`
- `tests/vscode-scan-controller.test.ts`
- `tests/e2e/scan.e2e.test.ts`
- `tests/e2e/goldens/*`

## Proposed design

### 1. Extend check metadata so scan planning can see domains

The batched planner needs domain metadata before prompt construction.

Planned change:

- extend `CheckCatalogEntry` with `domain: string | null`,
- read `domain` from markdown frontmatter inside `listCheckCatalog()`,
- if frontmatter `domain` is missing, infer it from the check id or filename by
  taking the prefix before the numeric token,
- keep project-local compatibility:
  - if a project check has `domain` frontmatter, use it,
  - if it has no `domain` but its id or filename follows the normal check
    naming pattern, batch by the inferred prefix,
  - if neither source yields a domain, mark it as unbatchable and schedule it
    alone.

Suggested inference rule:

- match the first numeric segment in the id or basename,
- use everything before that segment as the inferred domain,
- trim a trailing `-` if present.

Examples:

- `bp-api-001-machine-readable-error-contracts` -> `bp-api`
- `rel-typescript-001-validate-async-boundaries-before-side-effects` ->
  `rel-typescript`

This keeps bundled checks batchable immediately, preserves backward
compatibility for older custom checks, and still avoids unsafe grouping when a
legacy filename does not follow the normal naming pattern.

### 2. Introduce an explicit domain-batch planning step

Add a planner that converts selected checks into ordered scan jobs.

Suggested job shape:

```ts
interface ScanBatchJob {
  kind: 'scan-batch';
  batchId: string;
  domain: string | null;
  checkIds: string[];
}
```

Planner rules:

- group only checks with the same non-empty `domain`,
- preserve original check order inside each batch,
- preserve deterministic batch ordering based on the first selected check in the
  batch,
- split a large domain group into multiple batches when it exceeds a fixed cap.

The split cap should be deterministic and simple, for example:

- maximum checks per batch,
- and optionally maximum combined definition length.

That split is important because token optimization should not turn a 30-check
`rel` selection into a single fragile mega-prompt.

### 3. Replace the one-check prompt contract with a batch result contract

Introduce batch prompt construction in `src/lib/evaluator.ts`.

Prompt shape:

- one shared repo/scope section,
- one shared rules/output-contract section,
- one repeated section per check containing:
  - check id,
  - title if available,
  - full markdown definition.

Suggested output contract:

```json
{
  "results": [
    {
      "id": "check-a",
      "version": "0.1.0",
      "status": "pass|fail|unknown",
      "confidence": "HIGH|MEDIUM|LOW",
      "evidence": ["relative/path:line"],
      "rationale": "short explanation grounded in evidence",
      "remediation": ["action 1", "action 2"]
    }
  ]
}
```

Validation rules:

- every requested check id must appear exactly once,
- extra check ids are ignored and logged,
- missing or invalid entries become per-check `unknown` results,
- scope-evidence validation still runs per check,
- one malformed result must not discard valid siblings from the same batch.

This is the key change that converts token savings into a stable scan contract
instead of an all-or-nothing batch parser.

### 4. Update the scan system prompt for domain-batch evaluation

`prompts/scan-system.md` currently says "Evaluate exactly one best-practice
check at a time".

It should instead say:

- evaluate one domain batch at a time,
- stay read-only,
- return only the requested batch JSON payload,
- assess each check independently even though the prompt contains multiple
  checks.

The prompt should also warn against collapsing similar checks into one shared
result. The agent must produce a distinct result for each listed check.

### 5. Make the shared scheduler batch-aware

The initial scan scheduler in `src/lib/scan.ts` needs to run batch jobs rather
than check ids.

Native scan path:

- `runNativeScan()` should plan batches once after check selection,
- worker concurrency should apply to batches,
- when a batch starts, mark all member check ids as running,
- when a batch completes, fan results back into `resultsByCheckId` and advance
  `completedCount` by the number of finished checks.

Native session path:

- `createNativeScanSession()` needs a batch-aware pending queue for initial scan
  work,
- `requestRecheck(checkId)` remains a single-check read job,
- `requestFix(checkId)` remains an exclusive single-check flow,
- recheck/fix requests must treat checks inside an active batch as already
  running.

This likely means replacing the current "pending job = one check id" assumption
with a discriminated union for:

- batch scan jobs,
- single-check rechecks.

### 6. Keep repo mutation protection and retry behavior

Batching must not weaken read-only guarantees.

Planned behavior:

- wrap each batch attempt in `RepoMutationGuard`, just like current single-check
  evaluation,
- retry recoverable batch parsing failures,
- if one attempt produces a partially valid payload, salvage valid check results
  and mark only the broken entries as inconclusive,
- keep fix and recheck flows on the existing single-check paths.

This preserves the current trust model: scans stay read-only, fixes stay
explicitly separate.

### 7. Extend runtime metadata for batched sessions

One OpenCode session will now correspond to multiple checks.

Current runtime metadata:

- `checkId`
- `workerId`

Proposed runtime metadata:

- `batchId`
- `batchCheckIds`
- `batchLabel`
- keep `checkId` nullable for batch sessions,
- keep `workerId` for stream grouping.

This matters for operator surfaces:

- VS Code currently prefixes runtime output with `checkId` when present,
- TUI and VS Code both aggregate token usage from runtime events,
- the runtime stream model should be able to describe "rel batch (4 checks)"
  instead of pretending the session belongs to one check.

If we do not add batch metadata, the runner surfaces will lose useful runtime
context even if the core scan succeeds.

### 8. Keep TUI behavior check-oriented while exposing batch progress

The Ink TUI should remain check-oriented in the list/detail panes.

Planned TUI behavior:

- all checks in an active batch show as running,
- summary counts stay per check, not per batch,
- status text should mention the batch, for example:
  - `Running rel batch (5 checks)`,
  - `Completed sec batch (3 checks)`,
- token totals continue to aggregate from runtime events,
- `Fix` and `Recheck` actions still operate on exactly one selected finding.

This keeps the UI understandable: batching is visible as execution detail, not
as a new mental model for findings.

### 9. Update the VS Code runner and controller

The VS Code runner uses both the shared scan engine and its own scan-state
projection logic, so it needs explicit coverage.

Planned VS Code changes:

- native scans:
  - consume batch-aware session snapshots from `createNativeScanSession()`,
  - keep `runningCheckIds` populated for every check inside active batches,
  - surface batch labels in output lines and status text.
- Docker scans:
  - consume the same batch-aware progress/runtime event payloads through
    `runScan()` and Docker wire messages.
- token accounting:
  - keep aggregating by assistant message id,
  - do not assume one message equals one check.
- persisted context:
  - final saved reports remain unchanged,
  - partial live UI state may include batch-oriented labels, but persisted
    findings remain check-based.

The important constraint is that VS Code must not become a special-case runner.
Its controller should project batch execution into the same per-check view model
used today.

### 10. Update Docker protocol only where shared events change

Docker execution already reuses `runNativeScan()` inside the worker, so the main
behavioral change comes "for free" once the shared scan engine batches jobs.

Protocol updates are only needed if we add new event metadata such as:

- `batchId`,
- `batchCheckIds`,
- `batchLabel`.

`ScanReport` should stay unchanged so existing report readers do not care
whether the underlying scan used one-check prompts or domain batches.

## Testing plan

### Unit coverage

- `tests/checks.test.ts`
  - bundled checks expose `domain`,
  - project-local checks without `domain` infer it from the id or filename when
    possible,
  - project-local checks without frontmatter and without an inferable prefix
    stay singleton.
- `tests/evaluator.test.ts`
  - batch prompt construction,
  - batch response parsing,
  - duplicate ids,
  - missing ids,
  - partial invalid payload salvage,
  - per-check scope evidence enforcement.
- `tests/scan.test.ts`
  - scan plans domain batches,
  - progress counts still advance per check,
  - report ordering stays stable.
- `tests/scan-session.test.ts`
  - native session runs initial batch jobs,
  - recheck/fix still target one check,
  - fix waits for active batches to drain before mutating.

### Runner coverage

- `tests/vscode-scan-controller.test.ts`
  - batch runtime events still drive token labels,
  - multiple checks from one batch appear as running,
  - batch status text renders correctly for native and Docker flows,
  - cancel and completion paths do not regress.
- TUI-focused tests or reducer-level tests around `src/ui/scan-app.tsx`
  should verify:
  - batch running state marks every member check as in progress,
  - status labels prefer batch text,
  - single-check fix/recheck state remains unchanged.

### End-to-end coverage

- update `tests/e2e/scan.e2e.test.ts` so multiple same-domain checks produce
  fewer OpenCode requests than checks,
- refresh prompt goldens to assert that one prompt now contains multiple check
  definitions from the same domain,
- add at least one regression where selected checks span multiple domains so the
  scan still creates more than one prompt when appropriate.

## Rollout order

1. Add check-domain metadata and a deterministic batch planner.
2. Add batched evaluator prompt/response handling plus prompt update.
3. Swap initial scan scheduling from per-check jobs to per-batch jobs in
   `runNativeScan()` and `createNativeScanSession()`.
4. Extend runtime/progress event shapes only as needed for runner UX.
5. Update TUI and VS Code projections.
6. Refresh unit, integration, and e2e coverage.

## Risks and mitigations

- Risk: one very large domain batch hurts latency or exceeds prompt limits.
  Mitigation: deterministic batch split caps.
- Risk: one malformed batch response makes the whole domain inconclusive.
  Mitigation: validate per entry and salvage valid siblings.
- Risk: runner UIs regress because they assume one runtime session equals one
  check.
  Mitigation: explicitly update TUI and VS Code state adapters and cover them in
  tests.
- Risk: custom project checks without frontmatter domains get grouped
  incorrectly.
  Mitigation: prefer explicit frontmatter, use a narrow numeric-segment prefix
  inference rule for backward compatibility, and keep non-matching checks as
  singleton batches.

## Expected outcome

After this change, the first scan pass should send fewer, larger OpenCode
requests, especially for policy bundles with many same-domain checks. The user
still sees a normal per-check report, but token usage should fall because shared
scope and instruction text is no longer repeated once per check. Speed may also
improve when session startup and repeated prompt overhead dominate scan time.
