---
id: perf-014
title: Specify workload shape in storage benchmarks
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Systems Performance
    author: Brendan Gregg
---

# perf-014: Specify workload shape in storage benchmarks

## Intent
Prevent misleading storage benchmark numbers that cannot be compared, reproduced, or tied back to production behavior.

## Applicability
Applies when the diff adds or changes storage or filesystem benchmark scripts, CI perf tests, or benchmark documentation that makes claims about IOPS, latency, or throughput. Return `unknown` if the change is not a benchmark or does not claim storage performance.

## What to inspect
`fio` jobs, shell benchmark scripts, CI perf jobs, benchmark READMEs, workload generators, and target paths or devices under test.

## Pass criteria
The benchmark explicitly defines the workload shape needed to interpret results: read or write direction, random or sequential access, I/O size, concurrency or thread count, and whether it targets raw device behavior or filesystem behavior.

## Fail criteria
The diff adds a storage benchmark or performance claim that reports IOPS, throughput, or latency without specifying the essential workload dimensions, or claims raw disk performance while actually measuring through a cached filesystem path.

## Do not flag
Do not flag functional tests that happen to touch disk but are not intended as performance benchmarks. Do not flag benchmark wrappers that delegate these settings to a clearly versioned shared job file already referenced in the repo.

## Confidence guidance
`HIGH` when the benchmark config visibly omits core workload parameters or measures the wrong layer. `MEDIUM` when some workload shape is specified but one critical dimension is only implied. `LOW` when the real benchmark harness lives outside the repository.

## Remediation
Declare the benchmark's direction, access pattern, I/O size, concurrency, and target layer explicitly in the benchmark config.

## Pass example
```ini
[randread-4k]
filename=/dev/nvme0n1
rw=randread
bs=4k
iodepth=32
numjobs=4
direct=1
```

## Fail example
```bash
fio --name=test --size=1G
```
