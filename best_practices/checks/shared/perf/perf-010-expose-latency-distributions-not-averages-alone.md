---
id: perf-010
title: Expose latency distributions, not averages alone
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: "Systems Performance: Enterprise and the Cloud"
    author: Brendan Gregg
    year: 2020
---

# perf-010: Expose latency distributions, not averages alone

## Intent
Prevent teams from shipping monitoring or benchmark results that hide outliers and bimodal behavior behind a reassuring mean.

## Applicability
Applies when the diff adds or changes latency metrics, latency dashboards, performance tests, benchmark reporting, or SLO evaluation for request paths, database calls, file I/O, or network I/O. Return `unknown` if the change does not measure latency or the workload is purely throughput-oriented.

## What to inspect
Metric definitions, histogram and percentile exports, dashboards, benchmark output, perf-test assertions, alert logic, and documentation describing latency results.

## Pass criteria
Direct evidence shows the change records or reports a latency distribution using histograms, heat maps, or percentiles, optionally alongside averages.

## Fail criteria
The diff introduces or relies on average latency alone for a latency-sensitive path, with no repository evidence that percentiles or another distribution view is captured for the same measurement.

## Do not flag
Do not flag counters, pure throughput benchmarks, or CPU-bound microbenchmarks that are not making latency claims. Do not flag places where percentiles or histograms are already emitted by shared instrumentation outside the diff and clearly used for the same path.

## Confidence guidance
`HIGH` when the diff visibly reports only a mean or average for a latency-sensitive path. `MEDIUM` when distribution support may exist elsewhere in a shared telemetry layer. `LOW` when the workload's latency sensitivity is only loosely implied.

## Remediation
Add histogram or percentile reporting for the measured latency path instead of publishing only an average.

## Pass example
```python
REQUEST_LATENCY = Histogram(
    "request_latency_seconds",
    "End-to-end request latency",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)
```

## Fail example
```python
avg_latency_ms = total_latency_ms / request_count
print(f"average latency: {avg_latency_ms:.2f} ms")
```
