---
id: go-sec-001
title: External command execution validates input
domain: sec
language: go
app-type: [any]
status: active
sources: []
---

# go-sec-001: External command execution validates input

## Intent
`os/exec` boundaries can become command-injection paths when untrusted input controls executable choice or argument shape.

## Applicability
Applies when the code launches external processes through `exec.Command`, `exec.CommandContext`, shells, or wrapper helpers. Return `unknown` when input provenance is not visible.

## What to inspect
Changed process-launch code, executable names, argument slices, `sh -c` or `bash -c`, and formatted shell strings.

## Pass criteria
Commands use explicit executable plus argument slices, and untrusted input is validated or constrained by allowlists.

## Fail criteria
Untrusted input is passed to shell commands or concatenated command strings, or executable selection is externally controlled without strict validation.

## Do not flag
Constant command arrays. Test code.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when provenance is inferred. `LOW` when the source is unclear.

## Remediation
Use explicit executable plus argument slices and avoid shell execution for untrusted input.

## Pass example
```go
cmd := exec.Command("git", "checkout", validatedBranch)
```

## Fail example
```go
cmd := exec.Command("bash", "-lc", fmt.Sprintf("git checkout %s", userInput))
```
