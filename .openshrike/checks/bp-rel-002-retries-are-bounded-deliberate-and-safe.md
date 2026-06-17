---
id: bp-rel-002
title: Retries are bounded, deliberate, and safe for the operation
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: "AWS Builders' Library"
  - type: book
    title: Site Reliability Engineering
    chapter: Addressing Cascading Failures
  - type: standard
    title: Microsoft REST API Guidelines and Zalando RESTful API Guidelines
  - type: book
    title: Release It!
    author: Michael T. Nygard
  - type: book
    title: "The Site Reliability Workbook: Practical Ways to Implement SRE"
---

# bp-rel-002: Retries are bounded, deliberate, and safe for the operation

## Intent
Keep retries from multiplying outages or duplicating side effects.

## Applicability
Applies when the diff introduces or changes retry loops, retry libraries, redelivery handling, or retry response guidance.

## What to inspect
Retry counts, backoff, jitter, retry budgets, idempotency assumptions, and non-retriable failure handling.

## Pass criteria
Retries are bounded, use backoff where appropriate, and only apply to operations that are safe or explicitly deduplicated.

## Fail criteria
The diff adds unbounded retries, tight retry loops, or blind retries around non-idempotent work.

## Do not flag
Explicit no-retry choices for unsafe operations. In-memory retries with no external side effects.

## Confidence guidance
`HIGH` when unsafe or unbounded retry logic is directly visible. `MEDIUM` when retry safety is partly inferred. `LOW` when idempotency ownership is out of scope.

## Remediation
Bound retries, add backoff and jitter, and keep retry behavior aligned with side-effect safety.

## Pass example
```yaml
retry:
  max_attempts: 3
  backoff: exponential-jitter
```

## Fail example
```yaml
retry:
  while: true
  delay_ms: 0
```
