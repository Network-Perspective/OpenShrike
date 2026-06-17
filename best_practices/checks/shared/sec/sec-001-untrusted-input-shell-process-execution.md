---
id: sec-001
title: Untrusted input does not reach shell or process execution unsafely
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: book
    title: Designing Secure Software
    author: Loren Kohnfelder
    year: 2021
  - type: standard
    title: Bandit rule documentation + Semgrep Python security rules
  - type: article
    title: Bash Pitfalls
  - type: standard
    title: Brakeman warning documentation
  - type: standard
    title: Google Shell Style Guide
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
  - type: standard
    title: PHPStan / Psalm rule documentation
  - type: standard
    title: Rails Security Guide
  - type: article
    title: "Survive The Deep End: PHP Security"
---

# sec-001: Untrusted input does not reach shell or process execution unsafely

## Intent
Keep attacker-controlled data out of shell parsing and executable selection so data cannot become command structure.

## Applicability
Applies when the diff launches external processes, shells out, or constructs command lines. Return `unknown` when the command wrapper is visible but input provenance is not.

## What to inspect
Process-launch APIs, executable names, argument construction, `shell=True`, `cmd /c`, `bash -c`, PowerShell command text, and shell quoting or option handling.

## Pass criteria
The executable is fixed or allowlisted, arguments are passed as separate tokens where possible, and untrusted input never reaches shell parsing.

## Fail criteria
Untrusted input is concatenated into shell strings, command lines, or executable paths, or shell-sensitive contexts are built without strict validation.

## Do not flag
Constant command arrays. Test-only exploit fixtures. Developer tooling with no untrusted input path. Well-validated allowlisted command choices.

## Confidence guidance
`HIGH` when the injection path is directly visible. `MEDIUM` when input provenance is partly inferred. `LOW` when the command source is not visible.

## Remediation
Use fixed executables and argument arrays. Avoid shell execution on untrusted paths. Allowlist executable and argument shapes.

## Pass example
```python
subprocess.run(["git", "checkout", validated_branch], shell=False, check=True)
```

## Fail example
```python
subprocess.run(f"git checkout {user_branch}", shell=True, check=True)
```
