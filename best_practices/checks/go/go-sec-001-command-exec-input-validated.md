# GO-SEC-001: External command execution validates input

## Intent

`os/exec` boundaries can become command-injection paths when untrusted input
controls executable choice or argument shape.

## Applicability

Applies when the code launches external processes through `exec.Command`,
`exec.CommandContext`, shells, or wrapper helpers.

Return `unknown` when input provenance is not visible.

## Strategy

`static`

## What to inspect

1. Review changed process-launch code.
2. Check whether executable names and arguments are fixed or allowlisted.
3. Look for `sh -c`, `bash -c`, or formatted shell strings.

## Pass criteria

- Commands use explicit executable plus argument slices.
- Untrusted input is validated or constrained by allowlists.

## Fail criteria

- Untrusted input is passed to shell commands or concatenated command strings.
- Executable selection is externally controlled without strict validation.

## Do not flag

- Constant command arrays.
- Test code.

## Evidence to collect

- The command-execution call.
- The untrusted value reaching it.

## Confidence guidance

- `HIGH`: the injection path is directly visible.
- `MEDIUM`: input provenance is inferred from surrounding code.
- `LOW`: prefer `unknown` if the command is fixed but source is unclear.

## Remediation

- Use explicit executable plus argument slices.
- Avoid shell execution for untrusted input.
