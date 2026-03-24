# PYTHON-SEC-001: Subprocess execution avoids shell injection paths

## Intent

Python subprocess boundaries are command-injection boundaries. User-influenced
commands should not flow through `shell=True` or string-concatenated command
lines.

## Applicability

Applies when the code calls `subprocess`, `os.system`, `asyncio.create_subprocess_*`,
or wrappers around them.

Return `unknown` when input provenance is not visible.

## Strategy

`static`

## What to inspect

1. Find subprocess calls in changed code.
2. Check whether commands use argument lists and fixed executables.
3. Look for `shell=True`, `os.system`, or formatted shell strings.

## Pass criteria

- Commands are passed as argument lists.
- Executables and arguments are fixed or validated from a narrow allowlist.

## Fail criteria

- `shell=True` is used with external input.
- Command strings are built through interpolation or concatenation from
  untrusted values.
- `os.system` executes externally influenced content.

## Do not flag

- Constant command lists with no external input.
- Test code exercising subprocess wrappers.

## Evidence to collect

- The subprocess call.
- The untrusted value reaching the command line or shell.

## Confidence guidance

- `HIGH`: the injection path is directly visible.
- `MEDIUM`: input provenance is inferred from surrounding code.
- `LOW`: prefer `unknown` if the command is fixed but the source is unclear.

## Remediation

- Use argument arrays with `shell=False`.
- Allowlist command choices and validate arguments explicitly.
