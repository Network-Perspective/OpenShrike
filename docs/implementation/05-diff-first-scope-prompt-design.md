# Diff-First Scope Evidence for Scan Prompts

Date: 2026-05-06

Status: proposed

Scope:
- `shrike scan` prompt construction for non-`full` scopes
- `uncommitted`, `commit`, `branch`, and `pr`

## Summary

OpenShrike currently tells the reviewing agent which files are in scope, but it
does not provide the actual patch that defined that scope. As a result, the
agent often spends time rerunning `git diff`, `git show`, or `git status`
inside the repo before it can reason about the change.

The recommended change is:

1. keep resolving scan scope once per scan on the host side,
2. capture the exact git command(s) used to define that scope,
3. inject both the command text and its captured diff output into each check
   prompt,
4. keep the scoped file allowlist for evidence validation near its current
   position,
5. append the captured diff block as the final section of the prompt.

This should reduce redundant tool use by the agent and make the review input
more self-contained. It should not be implemented as an uncapped "always dump
the whole patch" change; large diffs need a bounded fallback.

## Problem

Current behavior in `src/lib/evaluator.ts`:

- emits `Review scope: ...`
- emits `Scoped files:`
- lists up to 200 files
- then emits the check definition markdown

Issues with the current prompt:

- The agent sees filenames but not the actual change content.
- The agent has a strong incentive to rerun git commands to reconstruct the
  patch.
- The prompt says evidence must come from "listed scoped files", but the list
  is truncated after 200 entries while the validator still allows all files in
  `scopeContext.files`.
- Shared scan context is repeated per check, but it is not placed in the most
  cache-friendly order because `Check id:` appears before the shared scope
  block.

## Goals

- Give the agent authoritative diff context for non-`full` scans.
- Include the exact command that OpenShrike already executed so the agent does
  not need to rerun it just to discover scope.
- Preserve existing scope validation based on repo-relative file paths.
- Reuse the same captured scope evidence across all checks in a scan.
- Keep large PRs or branch diffs from blowing up prompt size without bounds.
- Require the diff block to be the last thing appended to the prompt.

## Non-goals

- Changing check semantics or policy/check markdown.
- Broadening scope beyond the current changed-file model.
- Preventing the agent from opening scoped files directly when it needs exact
  current line numbers.
- Replacing full-repository scans with a synthetic giant diff.
- Solving provider-specific prompt caching in a provider-specific way.

## Current baseline

Today the flow is:

1. `resolveScanScope(...)` computes a `ScanScopeContext` with:
   - `kind`
   - `label`
   - `files`
   - `isFullRepository`
2. `buildPrompt(...)` renders:
   - repo path
   - check id
   - review scope
   - scoped file list
   - check definition
   - JSON schema and rules
3. `validateEvidenceScope(...)` still validates evidence against the full
   `scopeContext.files` array, not the truncated prompt rendering.

This is simple, but it offloads too much reconstruction work to the agent.

## Design options considered

### Option A: Replace the file list with raw diff only

Pros:
- Maximum change context.
- Simplest mental model for the agent.

Cons:
- Loses the explicit allowlist unless we parse it back out of the patch.
- Large diffs can dominate prompt size.
- Does not address prompt-prefix caching by itself.

Rejected.

### Option B: Keep file list and add captured git diff

Pros:
- Preserves current scope validation model.
- Gives the agent the actual patch.
- Lets us carry the exact command text into the prompt.
- Works for uncommitted, commit, branch, and PR scopes with the same shape.

Cons:
- Larger prompt than today.
- Requires a bounded fallback for large diffs.

Recommended.

### Option C: Write the diff to an artifact only and mention it in the prompt

Pros:
- Smaller prompt.
- Good for debugging.

Cons:
- Does not solve the core issue because the agent still needs to discover or
  open that artifact.
- Less self-contained than embedding the scope evidence directly.

Rejected as the primary approach. It can still be a secondary debugging aid.

## Recommended design

### 1. Extend `ScanScopeContext` with prompt-ready scope evidence

Keep `files` and `isFullRepository`, but add structured scope capture data.

Suggested shape:

```ts
interface ScanScopeCommandCapture {
  description: string;
  command: string;
  output: string;
}

interface ScanScopeEvidence {
  mode: 'complete' | 'omitted';
  commands: ScanScopeCommandCapture[];
}
```

Then extend `ScanScopeContext` with:

```ts
scopeEvidence?: ScanScopeEvidence | undefined;
```

This keeps scope resolution as a data problem instead of making
`buildPrompt(...)` responsible for rerunning git.

### 2. Capture scope evidence once per scan

The scan scope should still be resolved once in `runScan(...)`, before any
checks run. The new part is that scope resolution should also capture the git
command output needed for the prompt.

Recommended command strategy:

#### `uncommitted`

Use one command for tracked changes relative to `HEAD`:

```bash
git -C <repo> --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative HEAD
```

This covers:
- staged changes,
- unstaged changes,
- deletions,
- renames,
- mode changes.

Untracked files still need explicit handling because `git diff HEAD` does not
include them. Recommended flow:

1. discover untracked files with:

```bash
git -C <repo> --no-pager ls-files --others --exclude-standard
```

2. for each untracked path, synthesize a patch with:

```bash
git -C <repo> --no-pager diff --no-color --no-index -- /dev/null <path>
```

This keeps the "exact command already executed" property the user asked for.

#### `commit`

Use one diff-style command for both single commits and ranges:

- single commit:

```bash
git -C <repo> --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative <commit>^!
```

- range:

```bash
git -C <repo> --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative <range>
```

#### `branch`

```bash
git -C <repo> --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative <base>...HEAD
```

#### `pr`

```bash
git -C <repo> --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative <diffSpec>
```

This matches the current `origin/main...HEAD` default model.

### 3. Keep the scoped file allowlist

The prompt should still include the scoped file allowlist because:

- evidence validation already depends on it,
- it is far cheaper than the patch itself,
- it makes the allowed evidence set explicit,
- it avoids brittle "parse the patch to recover the file list" logic.

Recommended change:

- stop truncating the prompt file list at 200 by default,
- treat the allowlist as authoritative for evidence validation,
- if we ever need to truncate the list for extreme cases, the prompt wording
  must no longer say "listed scoped files".

For the first implementation, the cleanest path is to include the full file
allowlist and rely on diff omission, not file-list truncation, as the main
size control.

### 4. Keep the allowlist early and append the diff last

The scoped file allowlist can stay near its current position in the prompt, but
the captured diff block should be appended at the very end.

Recommended prompt order:

1. repo path
2. check id
3. review scope
4. scoped file allowlist
5. check definition markdown
6. output schema
7. rules
8. authoritative scope evidence block

The important point is that the raw diff should be the last thing appended to
the prompt. The allowlist can remain earlier because it is compact and still
useful for evidence validation.

### 5. Prompt shape

Recommended non-`full` prompt structure:

```text
You are executing a single OpenShrike best-practice check against repository path: /repo

Check id: bp-arch-003-composition-root-owns-wiring

Review scope: pull request diff origin/main...HEAD.

Scoped file allowlist (18):
- src/cli.ts
- src/lib/evaluator.ts
- ...

Check definition markdown:
---
...
---

Rules:
- ...

Authoritative scope evidence:
The commands below were already executed by OpenShrike to define this review scope.
Reuse this captured output instead of rerunning git scope-discovery commands.
If you need exact current line numbers, you may open files from the scoped file allowlist only.

Scope capture 1:
Command:
git -C /repo --no-pager diff --no-color --no-ext-diff --find-renames --submodule=short --relative origin/main...HEAD
Output:
<raw diff output here>
```

Recommended prompt rule changes:

- replace "evidence paths MUST come from listed scoped files" with
  "evidence paths MUST come from the scoped file allowlist above"
- add
  "Treat the captured scope evidence at the end of this prompt as authoritative for scope discovery"
- add
  "Do not rerun `git status`, `git diff`, `git show`, or `git log` to redefine scope when the full captured diff is attached"

### 6. Large-diff fallback

An uncapped inline diff is risky. A large branch or PR can consume most of the
model context even when it is appended last.

Recommended fallback policy:

1. capture the full scope evidence internally,
2. include full output in the prompt only when it fits under an inline diff
   limit,
3. otherwise omit the final scope-evidence block from the prompt entirely and
   rely on:
   - the full scoped file allowlist,
   - prompt rules telling the agent to inspect scoped files directly.

Suggested implementation detail:

- use a line-count cap of roughly 1,000 diff lines,
- make the cap a constant so it can be tuned after a few real scans.

Prompt wording for omitted scope evidence:

- do not append a final scope-evidence block,
- tell the agent in the rules that no inline diff is attached for this scope,
- tell the agent to inspect scoped files directly rather than relying on a
  partial diff.

This preserves the core benefit without letting one large diff dominate every
check prompt.

### 7. `full` scope behavior

Do not synthesize a full-repo diff.

For `full`:

- keep current behavior,
- omit scope evidence commands,
- keep the prompt rule that full-repo scans may inspect the repository.

## Token and caching analysis

Two separate effects matter here.

### 1. Raw input size

Embedding diffs will increase prompt size relative to a file-list-only prompt.
That is unavoidable.

Implications:

- single-check scans over tiny changes should still be fine,
- large policies over medium diffs will cost more raw input tokens per prompt,
- very large diffs should omit the inline diff entirely.

### 2. Prompt reuse tradeoff

Appending the diff last is not the most cache-friendly ordering.

Why:

- provider-side prompt caching usually benefits repeated identical prefixes,
- `Check id:` and check markdown still diverge before the diff block,
- the explicit requirement here is that the diff be the final appended section.

What still helps:

- retries of the same check, because the full prompt is identical,
- scans over smaller diffs, because the agent no longer needs to rediscover
  scope with extra git commands,
- repeated reruns of the same scan scope, if the diff and repo path are
  unchanged.

Bottom line:

- replacing the file list with a diff should still reduce redundant agent work,
- appending the diff last trades some cache-reuse potential for a clearer and
  stricter prompt contract.

## Validation and behavior implications

What should stay the same:

- `validateEvidenceScope(...)` should still validate against
  `scopeContext.files`,
- out-of-scope evidence should still fail the attempt and trigger recovery,
- `status="unknown"` remains the right answer when relevant evidence exists
  only outside the scoped allowlist.

What should change:

- the prompt should no longer imply that only the first 200 rendered filenames
  are valid,
- the prompt should explicitly say the git output was already captured and
  should be reused.

## Observability

Recommended additions:

- log per-scan scope capture metadata:
  - command count,
  - output line counts,
  - omission status,
  - rendered scope-block hash
- optionally write the rendered scope evidence block into the artifacts
  directory when one is configured

This is useful for:

- debugging prompt construction,
- understanding prompt growth,
- verifying that all checks in a scan used the same captured scope evidence.

## Implementation plan

1. Extend `ScanScopeContext` to carry scope evidence commands and outputs.
2. Refactor `src/lib/scope.ts` so non-`full` scope resolution returns:
   - scoped file allowlist,
   - prompt-ready scope evidence captures.
3. Update `src/lib/evaluator.ts`:
   - render the full allowlist,
   - render the scope evidence block only when a full inline diff is attached,
   - keep the allowlist earlier in the prompt,
   - append the scope evidence block last when present,
   - update the scope-related rules.
4. Add inline-diff line-limit helpers and constants for prompt-size control.
5. Add tests for:
   - prompt rendering with captured commands,
   - uncommitted scope with untracked files,
   - prompt ordering,
   - omitted-diff prompts that do not render empty scope-capture stubs,
   - evidence validation still using the full allowlist.
6. Optionally emit a scope-evidence artifact for debugging.

## Acceptance criteria

- For non-`full` scopes, each check prompt includes:
  - review scope label,
  - scoped file allowlist,
  - captured diff output when it is within the inline limit.
- When the diff exceeds the inline limit, no final scope-evidence block is
  appended.
- When present, the captured diff block is appended after the rules as the
  final prompt section.
- Scope evidence is captured once per scan and reused for every check.
- Evidence validation remains path-based and scope-constrained.
- Large diffs do not produce unbounded prompt growth.

## Recommendation

Implement Option B as a bounded hybrid:

- file allowlist stays,
- diff becomes the primary scope evidence,
- command text is included verbatim in the prompt only when the inline diff is
  attached,
- large diffs omit inline diff output entirely,
- the scoped file allowlist can stay near its current position,
- the captured diff block is appended last when present.

That is the best balance between reviewer usefulness, token discipline, and the
required prompt shape.
