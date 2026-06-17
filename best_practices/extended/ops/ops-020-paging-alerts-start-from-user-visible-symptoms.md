---
id: ops-020
title: Paging alerts start from user-visible symptoms, not self-healed transients
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Observability Engineering
---

# ops-020: Paging alerts start from user-visible symptoms, not self-healed transients

## Intent
Reduce alert fatigue by paging on degraded user experience rather than raw infrastructure signals or auto-remediated transient events.

## Applicability
Applies when the diff adds or changes paging alert definitions.

## What to inspect
Alert queries, severity routing, incident policies, and whether the page measures user-visible harm or a self-healed transient.

## Pass criteria
Pages are driven by user-visible failures, latency harm, or equivalent service-level degradation, while self-healed transients stay nonpaging.

## Fail criteria
The diff pages on raw system counters or on transient events the platform normally remediates automatically.

## Do not flag
Nonpaging warnings, dashboards, or business-hours triage alerts.

## Confidence guidance
`HIGH` when the page signal is directly visible. `MEDIUM` when user impact is inferred from naming or linked SLI config. `LOW` when routing is partly external.

## Remediation
Drive pages from user-visible symptoms and downgrade self-healed transients to nonpaging signals.

## Pass example
```yaml
alert: CheckoutAvailabilityPage
expr: slo_bad_events_total{journey="checkout"} / slo_eligible_events_total{journey="checkout"} > 0.01
labels:
  severity: page
```

## Fail example
```yaml
alert: PodRestarted
expr: increase(kube_pod_container_status_restarts_total[5m]) > 0
labels:
  severity: page
```
