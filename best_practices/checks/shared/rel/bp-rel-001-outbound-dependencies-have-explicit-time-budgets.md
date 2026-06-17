---
id: bp-rel-001
title: Outbound dependencies have explicit time budgets
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: "AWS Builders' Library: Timeouts, retries, and backoff with jitter"
  - type: book
    title: Release It!
    author: Michael T. Nygard
  - type: book
    title: Secure by Design
    author: Dan Bergh Johnsson, Daniel Deogun, Daniel Sawano
  - type: book
    title: "The Site Reliability Workbook: Practical Ways to Implement SRE"
---

# bp-rel-001: Outbound dependencies have explicit time budgets

## Intent
Bound remote calls, waits, and queue or pool acquisition so one slow dependency cannot pin work indefinitely.

## Applicability
Applies to outbound I/O, blocking waits, connection pools, queues, and similar external waits. Return `unknown` when a shared wrapper owns timeout policy outside the visible scope.

## What to inspect
Changed client construction, request calls, wait loops, pool acquisition, and timeout or deadline configuration.

## Pass criteria
The changed path has an explicit timeout, deadline, or caller-driven cancellation budget.

## Fail criteria
The changed path relies on unbounded defaults or waits forever on remote or contended work.

## Do not flag
Pure in-memory work. Paths already clearly bounded by visible caller cancellation.

## Confidence guidance
`HIGH` when an unbounded wait is directly visible. `MEDIUM` when policy may be hidden in a wrapper. `LOW` when the owning client is out of scope.

## Remediation
Add an explicit timeout, deadline, or cancellation-aware wait.

## Pass example
```go
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
resp, err := client.Do(req.WithContext(ctx))
```

## Fail example
```go
resp, err := client.Do(req)
```
