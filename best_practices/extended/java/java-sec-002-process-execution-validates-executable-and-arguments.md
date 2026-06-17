---
id: java-sec-002
title: Process execution validates executable and arguments
domain: sec
language: java
app-type: [any]
status: active
sources: []
---

# java-sec-002: Process execution validates executable and arguments

## Intent
Process execution is a command-injection boundary. `ProcessBuilder` and shell wrappers should not concatenate untrusted input into commands.

## Applicability
Applies when the code launches external processes through `ProcessBuilder`, `Runtime.exec`, or wrapper libraries. Return `unknown` when the source of arguments is not visible.

## What to inspect
Changed process-launch code, executable and argument selection, and shell-wrapper or string-concatenation usage.

## Pass criteria
Executables are fixed or allowlisted, and arguments are passed as separate tokens.

## Fail criteria
Untrusted input is concatenated into shell commands or `Runtime.exec` strings, or executable paths are externally controlled with no strict validation.

## Do not flag
Constant command arrays. Test fixtures.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when provenance is inferred. `LOW` when the source is unclear.

## Remediation
Use argument lists, not shell strings, and allowlist executable and argument shapes.

## Pass example
```java
new ProcessBuilder("git", "checkout", validatedBranch).start();
```

## Fail example
```java
Runtime.getRuntime().exec("git checkout " + userInput);
```
