# JAVA-SEC-002: Process execution validates executable and arguments

## Intent

Process execution is a command-injection boundary. `ProcessBuilder` and shell
wrappers should not concatenate untrusted input into commands.

## Applicability

Applies when the code launches external processes through `ProcessBuilder`,
`Runtime.exec`, or wrapper libraries.

Return `unknown` when the source of arguments is not visible.

## Strategy

`static`

## What to inspect

1. Review changed process-launch code.
2. Check whether executable and arguments are fixed or allowlisted.
3. Look for shell wrappers and string concatenation.

## Pass criteria

- Executables are fixed or allowlisted.
- Arguments are passed as separate tokens.

## Fail criteria

- Untrusted input is concatenated into shell commands or `Runtime.exec` strings.
- Executable paths are externally controlled with no strict validation.

## Do not flag

- Constant command arrays.
- Test fixtures.

## Evidence to collect

- The process-launch call.
- The untrusted value reaching it.

## Confidence guidance

- `HIGH`: the injection path is directly visible.
- `MEDIUM`: input provenance is inferred from surrounding code.
- `LOW`: prefer `unknown` if the command is fixed but source is unclear.

## Remediation

- Use argument lists, not shell strings.
- Allowlist executable and argument shapes.
