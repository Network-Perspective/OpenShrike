---
id: rel-001
title: Transient resources are released on every path
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
  - type: article
    title: Practical Go and Real World Advice
    author: Dave Cheney
  - type: standard
    title: Effective Go + Go Code Review Comments
  - type: book
    title: Effective Kotlin
    author: Marcin Moskala
  - type: book
    title: Fluent Python
  - type: article
    title: The Hitchhiker's Guide to Python + Google Python Style Guide
  - type: standard
    title: Uber Go Style Guide
---

# rel-001: Transient resources are released on every path

## Intent
Release files, sockets, locks, cursors, and similar transient resources even on early returns and failures.

## Applicability
Applies when the diff acquires closeable or unlockable resources or introduces per-iteration resource acquisition.

## What to inspect
Acquisition sites, cleanup placement, loop bodies, and exception or early-return paths.

## Pass criteria
Cleanup is established immediately and loop-scoped resources are released within each iteration.

## Fail criteria
The diff leaks cleanup behind branching, misses error paths, or defers per-iteration cleanup until an outer function returns.

## Do not flag
Values with no external cleanup obligation. Tiny scopes whose cleanup is visibly immediate.

## Confidence guidance
`HIGH` when a missing close, unlock, or loop-scoped leak is directly visible. `MEDIUM` when helper-owned cleanup is partly hidden. `LOW` when ownership is unclear.

## Remediation
Establish cleanup immediately after acquisition and keep iteration cleanup inside the iteration.

## Pass example
```python
with open(path) as f:
    return f.read()
```

## Fail example
```python
f = open(path)
return f.read()
```
