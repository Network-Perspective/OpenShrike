# JAVASCRIPT-SEC-001: Child process execution avoids shell injection

## Intent

Node child-process APIs become command-injection sinks when untrusted input
flows into shell strings or executable selection.

## Applicability

Applies to `child_process`, `execa`, worker wrappers, and build/runtime scripts
that execute external processes.

Return `unknown` when the process wrapper exists but input provenance is out of
scope.

## Strategy

`static`

## What to inspect

1. Review `exec`, `execSync`, `spawn`, `spawnSync`, `fork`, and wrapper calls.
2. Check whether arguments are passed as arrays and whether `shell` execution is
   involved.

## Pass criteria

- Executables are fixed or allowlisted.
- Arguments are passed as separate tokens.
- Untrusted input never reaches shell parsing.

## Fail criteria

- External input is interpolated into `exec` or `shell: true` commands.
- Executable paths or shell fragments are built from untrusted values.

## Do not flag

- Constant commands with no external input.
- Test code exercising wrappers.

## Evidence to collect

- The process-launch call.
- The untrusted value reaching the shell or command string.

## Confidence guidance

- `HIGH`: the injection path is directly visible.
- `MEDIUM`: input provenance is inferred from surrounding code.
- `LOW`: prefer `unknown` if the command is fixed but the source is unclear.

## Remediation

- Use argument arrays.
- Avoid shell execution for untrusted input.
- Allowlist executable and argument shapes.
