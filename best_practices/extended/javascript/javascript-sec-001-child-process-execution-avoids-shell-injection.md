---
id: javascript-sec-001
title: Child process execution avoids shell injection
domain: sec
language: javascript
app-type: [http-service, batch-job, cli, library, other]
status: active
sources: []
---

# javascript-sec-001: Child process execution avoids shell injection

## Intent
Node child-process APIs become command-injection sinks when untrusted input flows into shell strings or executable selection.

## Applicability
Applies to `child_process`, `execa`, worker wrappers, and build or runtime scripts that execute external processes. Return `unknown` when the process wrapper exists but input provenance is out of scope.

## What to inspect
`exec`, `execSync`, `spawn`, `spawnSync`, wrapper calls, argument arrays, and `shell` usage.

## Pass criteria
Executables are fixed or allowlisted, arguments are passed as separate tokens, and untrusted input never reaches shell parsing.

## Fail criteria
External input is interpolated into `exec` or `shell: true` commands, or executable paths or shell fragments are built from untrusted values.

## Do not flag
Constant commands with no external input. Test code exercising wrappers.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when provenance is inferred. `LOW` when the source is unclear.

## Remediation
Use argument arrays, avoid shell execution for untrusted input, and allowlist executable and argument shapes.

## Pass example
```javascript
spawn("git", ["checkout", validatedBranch], { shell: false })
```

## Fail example
```javascript
exec(`git checkout ${userBranch}`)
```
