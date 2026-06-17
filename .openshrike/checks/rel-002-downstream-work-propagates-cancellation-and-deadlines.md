---
id: rel-002
title: Downstream work propagates cancellation/deadlines and stops when callers are done
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Site Reliability Engineering
    chapter: Addressing Cascading Failures
    section: Latency and Deadlines
---

# rel-002: Downstream work propagates cancellation/deadlines and stops when callers are done

## Intent
Prevent downstream work from continuing after the original request can no longer observe the result.

## Applicability
Applies to fan-out requests, hedged requests, RPCs, and nested remote calls.

## What to inspect
Deadline propagation, cancellation propagation, sibling-request shutdown, and expiration handling.

## Pass criteria
Downstream work receives the caller deadline or cancellation and stops promptly when it expires.

## Fail criteria
The diff creates downstream work that ignores caller deadlines or leaves sibling work running after the result no longer matters.

## Do not flag
Purely local work that completes immediately. Detached work with a clearly different owner and purpose.

## Confidence guidance
`HIGH` when dropped deadlines or uncanceled fan-out are directly visible. `MEDIUM` when propagation may happen in a wrapper. `LOW` when call ownership is incomplete.

## Remediation
Pass deadlines and cancellation through the full call tree and cancel sibling work once it becomes unnecessary.

## Pass example
```go
ctx, cancel := context.WithCancel(parent)
defer cancel()
req = req.WithContext(ctx)
```

## Fail example
```go
req = req.WithContext(context.Background())
```
