---
id: perf-012
title: Do not infer disk bottlenecks from iowait or utilization alone
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Systems Performance
    author: Brendan Gregg
    section: "9.3.9 Utilization; 9.3.11 I/O Wait"
---

# perf-012: Do not infer disk bottlenecks from iowait or utilization alone

## Intent
Prevent misleading disk alerts and bad tuning work driven by summary metrics that do not capture what application threads actually experience.

## Applicability
Applies when the diff adds or changes storage performance dashboards, alerts, SLOs, or automated diagnostics. Return `unknown` if the change is not about storage observability or if no disk-related conclusions are being drawn.

## What to inspect
Alert rules, dashboard queries, threshold docs, recorded metrics, and any code that labels a condition as a disk bottleneck.

## Pass criteria
The change uses request latency, queue depth, blocked-thread time, pressure metrics, or a similarly direct pain metric for the application, optionally alongside `%util` or `iowait`.

## Fail criteria
The diff declares or alerts on a disk bottleneck using only `iowait`, disk utilization, or similar interval summaries, with no direct latency or blocking metric to validate application impact.

## Do not flag
Do not flag coarse host-overview dashboards that merely display `iowait` or utilization as contextual signals. Do not flag repos where a linked shared dashboard already pairs these summaries with direct latency or queueing metrics.

## Confidence guidance
`HIGH` when the alert or rule keys solely off `iowait` or `%util`. `MEDIUM` when summary metrics dominate but a weak corroborating metric exists. `LOW` when the actual downstream dashboard content is not visible in the repo.

## Remediation
Alert on request latency, queue depth, blocked-thread time, or another direct storage pain metric instead of `iowait` or utilization alone.

## Pass example
```yaml
alert: DiskLatencyHigh
expr: histogram_quantile(0.99, sum by (le, device) (rate(block_io_latency_seconds_bucket[5m]))) > 0.050
```

## Fail example
```yaml
alert: DiskBottleneck
expr: avg(rate(node_cpu_seconds_total{mode="iowait"}[5m])) > 0.30
```
