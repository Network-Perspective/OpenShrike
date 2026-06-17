---
id: csharp-sec-002
title: Process execution does not concatenate untrusted input
domain: sec
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-sec-002: Process execution does not concatenate untrusted input

## Intent
Process execution is a command-injection boundary. Executable names and arguments derived from external input must be constrained, preferably through allowlists and `ArgumentList`.

## Applicability
Applies when the code starts external processes through `ProcessStartInfo`, `Process.Start`, `cmd`, `bash`, PowerShell, or wrappers around them. Return `unknown` when the process wrapper exists but input provenance is not visible.

## What to inspect
`ProcessStartInfo`, `Process.Start`, wrapper helpers, `UseShellExecute`, `ArgumentList`, and shell-wrapper usage.

## Pass criteria
The executable is fixed or allowlisted, untrusted input is validated or mapped from safe enums, and arguments are supplied as individual tokens.

## Fail criteria
User input is concatenated into `Arguments`, the code shells out through `cmd /c`, `bash -c`, or PowerShell with externally influenced content, or the executable path itself is user-controlled without strict validation.

## Do not flag
Constant arguments. Developer tooling wrappers that never receive external input. Well-validated allowlisted commands.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when the launched process is clear but input provenance is partly inferred. `LOW` when the source is not visible.

## Remediation
Replace string concatenation with `ArgumentList`, keep `UseShellExecute = false`, and allowlist executables and argument shapes.

## Pass example
```csharp
var psi = new ProcessStartInfo("git") { UseShellExecute = false };
psi.ArgumentList.Add("checkout");
psi.ArgumentList.Add(validatedBranch);
```

## Fail example
```csharp
var psi = new ProcessStartInfo("bash", $"-lc \"git checkout {userInput}\"");
```
