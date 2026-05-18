# OpenShrike.TestsCsharp Fixture and Branch Workflow

Date: 2026-03-05

## Requested location
Sample C# project was created in:
- `../OpenShrike.TestsCsharp`

This is outside the OpenShrike repo and is intended as a dedicated fixture repository.

## Repository initialization
Commands executed:

```bash
git -C ../OpenShrike.TestsCsharp init -b main
dotnet new sln -n OpenShrike.TestsCsharp -o ../OpenShrike.TestsCsharp
dotnet new classlib -n SampleApp -o ../OpenShrike.TestsCsharp/src/SampleApp
dotnet sln ../OpenShrike.TestsCsharp/OpenShrike.TestsCsharp.sln add ../OpenShrike.TestsCsharp/src/SampleApp/SampleApp.csproj
```

Baseline commit on `main`:
- Commit: `f82b619`
- Message: `Initialize sample C# fixture project`

## Branches created for the first check policy
Check policy/check name:
- `csharp-rel-001-cancellation-tokens`

Branches:
1. `csharp-rel-001-pass`
2. `csharp-rel-001-fail`

### Pass branch
- Branch: `csharp-rel-001-pass`
- Commit: `2611628`
- Message: `Add cancellation-token compliant async API for pass fixture`

Behavior in code:
- Public Task-returning method accepts `CancellationToken ct`.
- Dependency call receives `ct` directly.

### Fail branch
- Branch: `csharp-rel-001-fail`
- Commit: `400c8e1`
- Message: `Add cancellation-token violation for fail fixture`

Behavior in code:
- Public Task-returning method accepts `CancellationToken ct`.
- Dependency call incorrectly uses `CancellationToken.None`.

## Verification results with OpenShrike CLI
Note: check execution is performed by `opencode` using the check markdown as instructions; OpenShrike orchestrates invocation and report shaping.

Pass branch run:

```bash
git -C ../OpenShrike.TestsCsharp checkout csharp-rel-001-pass
dotnet run --project src/OpenShrike.Cli -- scan \
  --check csharp-rel-001-cancellation-tokens \
  --path ../OpenShrike.TestsCsharp \
  --output json
```

Observed result:
- Exit code: `0`
- Check status: `pass`
- Confidence: `HIGH`

Fail branch run:

```bash
git -C ../OpenShrike.TestsCsharp checkout csharp-rel-001-fail
dotnet run --project src/OpenShrike.Cli -- scan \
  --check csharp-rel-001-cancellation-tokens \
  --path ../OpenShrike.TestsCsharp \
  --output json
```

Observed result:
- Exit code: `2`
- Check status: `fail`
- Confidence: `HIGH`
- Evidence: `src/SampleApp/UserService.cs`
- Rationale includes: method passes `CancellationToken.None` instead of propagated `ct`.

## Current checked-out fixture branch
After verification, fixture repository is currently on:
- `csharp-rel-001-fail`
