---
id: python-sec-001
title: Subprocess execution avoids shell injection paths
domain: sec
language: python
app-type: [any]
status: active
sources: []
---

# python-sec-001: Subprocess execution avoids shell injection paths

## Intent
Python subprocess boundaries are command-injection boundaries. User-influenced commands should not flow through `shell=True` or string-concatenated command lines.

## Applicability
Applies when the code calls `subprocess`, `os.system`, `asyncio.create_subprocess_*`, or wrappers around them. Return `unknown` when input provenance is not visible.

## What to inspect
Subprocess calls, command arrays, `shell=True`, `os.system`, and formatted shell strings.

## Pass criteria
Commands are passed as argument lists, and executables and arguments are fixed or validated from a narrow allowlist.

## Fail criteria
`shell=True` is used with external input, command strings are built from untrusted values, or `os.system` executes externally influenced content.

## Do not flag
Constant command lists with no external input. Test code exercising subprocess wrappers.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when provenance is inferred. `LOW` when the source is unclear.

## Remediation
Use argument arrays with `shell=False`, and allowlist command choices and arguments explicitly.

## Pass example
```python
subprocess.run(["git", "checkout", validated_branch], shell=False, check=True)
```

## Fail example
```python
os.system(f"git checkout {user_input}")
```
