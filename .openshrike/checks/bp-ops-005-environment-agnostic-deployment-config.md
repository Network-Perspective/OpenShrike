---
id: bp-ops-005
title: Deployment config is environment-agnostic
domain: ops
language: shared
app-type:
  - any
status: active
sources:
  - type: book
    title: Continuous Delivery
    author: Jez Humble and David Farley
  - type: article
    title: Hidden Technical Debt in Machine Learning Systems
  - type: book
    title: Sustainable Web Development with Ruby on Rails
  - type: article
    title: The Twelve-Factor App
---

# bp-ops-005: Deployment config is environment-agnostic

## Intent
Deployment artifacts should describe how to run the software, not hard-code environment-specific values that create drift between staging, prod, and local setups.

## Applicability
Applies to manifests, compose files, Helm charts, Terraform variables, deployment scripts, and runtime configuration loading. Return `unknown` when deployment config is not in scope.

## What to inspect
Changed deployment config, startup config loading, committed runtime settings, and whether deploy-varying values are injected instead of baked in.

## Pass criteria
Shared deploy artifacts stay portable across environments, and deploy-specific endpoints, hosts, resource handles, and secrets come from environment variables, secret stores, or explicit overlays.

## Fail criteria
A shared artifact hard-codes production or environment-specific values, or application code branches on named environments to select deploy-varying infrastructure values that should be injected.

## Do not flag
Explicit per-environment overlays, local-only development manifests, or placeholders and secret references with no live value.

## Confidence guidance
`HIGH` when shared deploy config directly contains environment-specific values. `MEDIUM` when the value looks deploy-specific but ownership is partly inferred. `LOW` when the changed file may be local-only.

## Remediation
Move deploy-varying values to configuration injection or overlays and keep shared artifacts portable.

## Pass example
```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: database-url
```

## Fail example
```yaml
env:
  - name: DATABASE_URL
    value: postgres://app:secret@prod-db.internal/app
```
