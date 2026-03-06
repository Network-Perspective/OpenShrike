# OpenShrike MVP Implementation: First C# Policy Check

Date: 2026-03-06

## Scope implemented
This implementation aligns with project requirements that checks run through `opencode` and are defined as policy/check instructions.

Implemented:
- CLI entry point for policy checks using Spectre.Console (`Spectre.Console.Cli`) command app.
- Check-definition resolution from markdown (`best_practices/checks/**`).
- `opencode` invocation for check execution.
- Structured JSON report emitted by OpenShrike.
- Policy markdown resolution (`best_practices/policies/**`) and multi-check policy runs.
- Human-readable markdown output (`--output markdown`).
- Bundle emission (`--emit-bundle <path>`).
- Scope-aware scans: `uncommitted` (default), `commit`, `branch`, `pr`, `full`.
- Scope target selection via `--scan-target`.
- Read-only mutation guardrail for repository files during agent execution.
- Spectre.Console progress UI with scope and per-check progress updates.

Not implemented:
- Hardcoded policy logic in OpenShrike for check semantics.

## Inputs reviewed before implementation
- `README.md`
- `docs/requirements/01-project-vision.md`
- `docs/requirements/02-feature-scope.md`
- `docs/requirements/03-security-model.md`
- `docs/requirements/04-agent-runtime.md`
- `docs/requirements/05-best-practices-library.md`
- `docs/requirements/06-observability.md`
- `docs/requirements/07-workflows-and-integrations.md`
- `best_practices/policies/csharp-baseline.md`
- `best_practices/checks/csharp/csharp-rel-001-cancellation-tokens.md`

## Runtime flow implemented
1. User runs `scan` with either `--check <id>` or `--policy <id>`.
2. OpenShrike resolves selected check(s) from markdown under `best_practices/checks` (for policies, check IDs are extracted from policy links).
3. OpenShrike resolves scope from git metadata or full-repo mode:
   - `uncommitted` (default): changed tracked/untracked files in working tree.
   - `commit`: files changed in a commit or commit range.
   - `branch`: files changed in `<base>...HEAD`.
   - `pr`: files changed in supplied diff spec (default `origin/main...HEAD`).
   - `full`: entire repository.
4. OpenShrike builds an agent prompt with:
   - check definition markdown,
   - repository path,
   - resolved scan scope and scoped file list (except `full`),
   - required JSON output schema.
5. OpenShrike executes:
   - `opencode run --format json --dir <repo> <prompt>`
6. OpenShrike parses streamed JSON events, extracts the agent text payload, parses check JSON, validates schema fields and scope-constrained evidence, and emits the final report envelope.
7. OpenShrike verifies repo files were not modified by the agent process.

## Command surface

```bash
shrike scan \
  (--check csharp-rel-001-cancellation-tokens | --policy csharp-baseline) \
  --repo <path> \
  [--scan-scope uncommitted|commit|branch|pr|full] \
  [--scan-target <target>] \
  [--output json|markdown] \
  [--emit-bundle <path>] \
  [--agent <agent>] \
  [--model <provider/model>]
```

Return codes:
- `0`: no failing checks.
- `2`: one or more failing checks.
- `1`: command/runtime error (invalid args, unknown check, `opencode` failure, invalid agent payload).

## CLI framework choice
- The CLI is implemented on `Spectre.Console.Cli` for command extensibility and consistent terminal UX.
- Current registered command:
  - `scan`
- This enables adding future commands (`policy`, `bundle`, `report`) without restructuring argument parsing.

## JSON output contract used
The output envelope follows observability requirements:
- `bundle_id`
- `policy_version`
- `repo.path`
- `summary.total_checks/passed/failed/unknown`
- `checks[]` entries with:
  - `id`
  - `version`
  - `status`
  - `confidence`
  - `evidence`
  - `rationale`
  - `remediation`

Markdown output mirrors the same data in human-readable form.

## Files added/updated
- `.gitignore`
- `OpenShrike.sln`
- `src/OpenShrike.Cli/Program.cs`
- `src/OpenShrike.Cli/Commands/ScanCommand.cs`
- `src/OpenShrike.Cli/OpenShrike.Cli.csproj` (Spectre package references)
- `src/OpenShrike.Core/Models/ScanReport.cs`
- `src/OpenShrike.Core/Runner/ScanRunner.cs`
- `src/OpenShrike.Core/Runner/CheckDefinitionResolver.cs`
- `src/OpenShrike.Core/Runner/OpencodeCheckEvaluator.cs`

## Local verification
Build:

```bash
dotnet build OpenShrike.sln
```

Run first check via agent:

```bash
shrike scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo ../OpenShrike.TestsCsharp \
  --scan-scope full \
  --output json
```

Run policy scan on uncommitted changes:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo ../OpenShrike.TestsCsharp
```

Run PR-style scan and emit markdown:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo ../OpenShrike.TestsCsharp \
  --scan-scope pr \
  --scan-target origin/main...HEAD \
  --output markdown
```

Observed behavior:
- Report is produced by OpenShrike.
- Check decision is produced by `opencode` following the check markdown instruction.
