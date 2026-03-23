# CSHARP-SEC-002: Process execution does not concatenate untrusted input

## Intent

Process execution is a command-injection boundary. Executable names and
arguments derived from external input must be constrained, preferably through
allowlists and `ArgumentList`.

## Applicability

Applies when the code starts external processes through `ProcessStartInfo`,
`Process.Start`, `cmd`, `bash`, PowerShell, or wrappers around them.

Return `unknown` when the process wrapper exists but input provenance is not
visible.

## Strategy

`static`

## What to inspect

1. Find `ProcessStartInfo` and process-launch wrappers.
2. Check whether executable names and arguments come from untrusted input.
3. Prefer `UseShellExecute = false` and `ArgumentList` over one big string.

## Pass criteria

- The executable is fixed or allowlisted.
- Untrusted input is validated, normalized, or mapped from safe enums.
- Arguments are supplied as individual tokens where possible.

## Fail criteria

- User input is concatenated into `Arguments`.
- The code shells out through `cmd /c`, `bash -c`, or PowerShell with
  externally influenced content.
- The executable path itself is user-controlled without strict validation.

## Do not flag

- Constant arguments.
- Developer tooling wrappers that never receive external input.
- Well-validated allowlisted commands.

## Evidence to collect

- The process-launch call.
- The user-controlled value reaching the executable or argument string.

## Confidence guidance

- `HIGH`: the injection path is directly visible.
- `MEDIUM`: the launched process is clear, but input provenance is partly
  inferred.
- `LOW`: prefer `unknown` if the source of the argument is not visible.

## Remediation

- Replace string concatenation with `ArgumentList`.
- Allowlist executables and argument shapes.
- Keep `UseShellExecute = false`.

## Pass example

```csharp
var branch = ValidateBranchName(inputBranch);
var psi = new ProcessStartInfo("git")
{
    UseShellExecute = false
};
psi.ArgumentList.Add("checkout");
psi.ArgumentList.Add(branch);
```

## Fail example

```csharp
var psi = new ProcessStartInfo("bash", $"-lc \"git checkout {userInput}\"");
```
