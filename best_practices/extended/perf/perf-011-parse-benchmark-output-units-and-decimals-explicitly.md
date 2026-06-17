---
id: perf-011
title: Parse benchmark output units and decimals explicitly
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Systems Performance
    author: Brendan Gregg
    section: "4.6 Observing Observability"
---

# perf-011: Parse benchmark output units and decimals explicitly

## Intent
Prevent false performance regressions or fake wins caused by benchmark parsers that corrupt tool output.

## Applicability
Applies when the diff adds or changes scripts, CI jobs, dashboards, or tooling that ingest performance-tool output and turn it into numeric comparisons, regressions, or release gates. Return `unknown` if the change does not parse numeric benchmark or telemetry output.

## What to inspect
Regexes, parsing helpers, unit-normalization code, CSV or JSON converters, shell pipelines, spreadsheet-export logic, and perf-gating thresholds.

## Pass criteria
The parser explicitly preserves decimals and converts declared units to a canonical unit before comparison or storage.

## Fail criteria
The diff strips non-digit characters without parsing units, drops decimal points, or compares mixed units as if they were the same numeric scale.

## Do not flag
Do not flag tooling that consumes already structured numeric output such as JSON with explicit units. Do not flag display-only formatting code that is not used for comparisons, gates, or alerts.

## Confidence guidance
`HIGH` when the parsing logic visibly removes units or decimals with string deletion or weak regexes. `MEDIUM` when the code likely relies on text shape assumptions but still does some normalization. `LOW` when the real parser is hidden behind an imported tool or opaque binary.

## Remediation
Parse the value and unit separately, preserve decimals, and normalize to one canonical unit before comparing results.

## Pass example
```python
import re

match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*([KMG]?B/s)", text)
value = float(match.group(1))
unit = match.group(2)
scale = {"B/s": 1, "KB/s": 1024, "MB/s": 1024**2, "GB/s": 1024**3}[unit]
bytes_per_second = value * scale
```

## Fail example
```bash
throughput=$(printf '%s' "$fio_result" | tr -cd '0-9')
```
