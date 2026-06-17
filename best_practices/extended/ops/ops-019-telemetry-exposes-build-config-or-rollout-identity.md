---
id: ops-019
title: Telemetry exposes build, config, or rollout identity
domain: ops
language: shared
app-type: [http-service, batch-job]
status: active
sources:
  - type: book
    title: Google SRE Workbook
  - type: book
    title: Observability Engineering
  - type: standard
    title: "OpenTelemetry Documentation: Semantic Conventions"
---

# ops-019: Telemetry exposes build, config, or rollout identity

## Intent
Let responders answer "what changed?" quickly by surfacing the active build, config, or rollout cohort in telemetry.

## Applicability
Applies when the diff changes deployable services, dynamic configuration, feature flags, or rollout cohorts.

## What to inspect
Metrics, structured logs, trace attributes, build IDs, config versions, service identity, and cohort fields.

## Pass criteria
Changed deployable behavior emits a stable service identity and exact build, config, or cohort metadata that can distinguish one rollout from another.

## Fail criteria
The diff changes deployable behavior but telemetry does not expose which build, config version, or rollout cohort is active, or uses moving labels like `latest` instead of exact identities.

## Do not flag
Services where the repo clearly shows shared platform injection of this metadata.

## Confidence guidance
`HIGH` when telemetry fields are explicit. `MEDIUM` when shared middleware may add them. `LOW` when rollout metadata lives outside the repo.

## Remediation
Emit stable service identity plus exact build, config, or cohort identifiers in monitoring-visible telemetry.

## Pass example
```yaml
env:
  - name: OTEL_SERVICE_NAME
    value: checkout-api
  - name: APP_BUILD_ID
    value: "2026.06.12.4"
```

## Fail example
```yaml
env:
  - name: APP_VERSION
    value: latest
```
