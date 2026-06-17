---
id: ops-021
title: Reliability objectives use event-based SLIs and tail-aware latency measures
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Google SRE Workbook
  - type: book
    title: Observability Engineering
  - type: book
    title: "The Site Reliability Workbook: Practical Ways to Implement SRE"
---

# ops-021: Reliability objectives use event-based SLIs and tail-aware latency measures

## Intent
Keep reliability targets aligned with user experience by measuring good-versus-total events and exposing latency tail behavior.

## Applicability
Applies when the diff adds or changes SLIs, SLOs, latency objectives, release gates, or reliability dashboards.

## What to inspect
SLO formulas, good or bad event classification, percentile or threshold latency logic, and mean-only latency objectives.

## Pass criteria
The reliability target is based on qualifying events and uses event-based good or bad ratios, and user-facing latency objectives expose tail behavior through thresholds or percentiles.

## Fail criteria
The diff defines SLIs only with coarse aggregates or mean latency, with no event qualification or tail-aware latency measure.

## Do not flag
Exploratory dashboards, capacity-only metrics, or internal reports that are not used as SLIs.

## Confidence guidance
`HIGH` when the formulas are direct. `MEDIUM` when shared recording rules hide some logic. `LOW` when vendor abstractions hide the underlying measurement.

## Remediation
Define user-facing reliability using event-based good or bad logic and tail-aware latency measures.

## Pass example
```yaml
sli:
  eligible: path == "/checkout"
  good: status < 500 && duration_ms < 400
```

## Fail example
```yaml
latency_slo:
  objective: "average latency < 120ms"
```
