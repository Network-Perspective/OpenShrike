---
id: ops-011
title: Container runtime remains immutable after build
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Secure and Reliable Systems
  - type: book
    title: Container Security
---

# ops-011: Container runtime remains immutable after build

## Intent
Prevent runtime drift and incomplete remediation by ensuring deployable containers run prebuilt artifacts instead of installing or patching software after start.

## Applicability
Applies when the diff changes entrypoints, startup scripts, init commands, runbooks, or remediation scripts for containerized workloads.

## What to inspect
Entrypoints, startup wrappers, `kubectl exec` remediation paths, and startup-time installs or downloads.

## Pass criteria
Required software is installed during image build and remediation rebuilds and redeploys a new image rather than patching a running container.

## Fail criteria
The diff installs software at container startup or patches running containers in place as the normal remediation path.

## Do not flag
Build steps in Dockerfiles, local-only scripts, or disposable debugging containers.

## Confidence guidance
`HIGH` when startup installs or live patching commands are directly visible. `MEDIUM` when wrapper logic is partly indirect. `LOW` when environment type is unclear.

## Remediation
Move installation to image build and replace live patching with rebuild-and-redeploy flows.

## Pass example
```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
ENTRYPOINT ["python", "server.py"]
```

## Fail example
```sh
pip install -r /app/requirements.txt
exec python /app/server.py
```
