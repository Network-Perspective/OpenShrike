---
id: ops-003
title: Deployments are smoke-tested before success
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Continuous Delivery
---

# ops-003: Deployments are smoke-tested before success

## Intent
Prevent broken releases from being marked complete when the process started but the service cannot actually do its job.

## Applicability
Applies when the diff changes deployment automation, service startup, or deploy-time dependency wiring.

## What to inspect
Post-deploy hooks, rollout jobs, health waits, smoke-test commands, and checks for required dependencies.

## Pass criteria
Deployment automation includes an automated post-deploy verification step that fails the rollout when the service or its critical dependencies are unavailable.

## Fail criteria
The deployment is treated as successful with no automated verification beyond file copy, process start, or pod creation.

## Do not flag
Platform-native health waits that the rollout actually honors.

## Confidence guidance
`HIGH` when deployment automation visibly lacks post-deploy validation. `MEDIUM` when checks exist but only prove process startup. `LOW` when deployment validation is external.

## Remediation
Add an automated post-deploy smoke test that checks real service readiness.

## Pass example
```bash
./bin/start-app
curl --fail http://127.0.0.1:8080/ready
```

## Fail example
```bash
./bin/start-app
echo "deploy complete"
```
