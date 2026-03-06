# OpenShrike MVP Implementation: First C# Policy Check

Date: 2026-03-05

## Scope implemented
This implementation aligns with project requirements that checks run through `opencode` and are defined as policy/check instructions.

Implemented:
- CLI entry point for policy checks using Spectre.Console (`Spectre.Console.Cli`) command app.
- Check-definition resolution from markdown (`best_practices/checks/**`).
- `opencode` invocation for check execution.
- Structured JSON report emitted by OpenShrike.

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
1. User runs `scan --check <id> --repo <path> --output json`.
2. OpenShrike resolves check markdown file `<id>.md` from `best_practices/checks`.
3. OpenShrike builds an agent prompt with:
   - check definition markdown,
   - repository path,
   - required JSON output schema.
4. OpenShrike executes:
   - `opencode run --format json --dir <repo> <prompt>`
5. OpenShrike parses streamed JSON events, extracts the agent text payload, parses check JSON, validates schema fields, and emits the final report envelope.

## Command surface

```bash
dotnet run --project src/OpenShrike.Cli -- scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo <path> \
  --output json \
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
dotnet run --project src/OpenShrike.Cli -- scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo ../OpenShrike.TestsCsharp \
  --output json
```

Observed behavior:
- Report is produced by OpenShrike.
- Check decision is produced by `opencode` following the check markdown instruction.
