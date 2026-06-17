---
id: rel-020
title: Runtime code does not depend on ambient host tools
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: The Twelve-Factor App
    section: "II. Dependencies"
---

# rel-020: Runtime code does not depend on ambient host tools

## Intent
Prevent deploys from failing because production hosts do not happen to carry the same OS tools as development machines.

## Applicability
Applies when the diff shells out during normal runtime behavior.

## What to inspect
Runtime subprocess calls, startup scripts, and dependencies on `tar`, `curl`, `git`, ImageMagick, or similar host tools.

## Pass criteria
Normal runtime behavior depends only on shipped artifacts or declared service dependencies, not ambient host binaries.

## Fail criteria
The diff adds runtime dependence on a host tool that is neither shipped nor managed as an explicit runtime dependency.

## Do not flag
Build-time or CI-only tooling.

## Confidence guidance
`HIGH` when a runtime shell-out to an ambient tool is directly visible. `MEDIUM` when packaging may include the tool elsewhere. `LOW` when execution phase is unclear.

## Remediation
Bundle the dependency explicitly, replace the shell-out with a library, or move the work to build time.

## Pass example
```python
from PIL import Image
```

## Fail example
```python
subprocess.run(["convert", input_path, output_path], check=True)
```
