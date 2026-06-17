---
id: ops-python-001
title: Subprocess waits are bounded by timeouts
domain: ops
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
---

# ops-python-001: Subprocess waits are bounded by timeouts

## Intent
Prevent hung workers and permanently blocked automation when child processes never complete.

## Applicability
Applies when Python code launches subprocesses and blocks waiting for them.

## What to inspect
`subprocess.run`, `Popen.communicate`, `wait`, timeout arguments, and timeout cleanup paths.

## Pass criteria
Blocking waits specify a timeout and handle the timeout path by terminating or otherwise cleaning up the child.

## Fail criteria
The diff adds a blocking wait on a subprocess with no timeout or stuck-process handling.

## Do not flag
Tests that intentionally exercise hangs or fire-and-forget subprocesses that are explicitly not awaited.

## Confidence guidance
`HIGH` when a direct wait lacks a timeout. `MEDIUM` when timeout behavior may be hidden in a wrapper. `LOW` when lifecycle is managed outside visible code.

## Remediation
Add an explicit timeout and handle timeout cleanup.

## Pass example
```python
proc = subprocess.Popen(["sleep", "10"])
proc.communicate(timeout=5)
```

## Fail example
```python
proc = subprocess.Popen(["sleep", "10"])
proc.communicate()
```
