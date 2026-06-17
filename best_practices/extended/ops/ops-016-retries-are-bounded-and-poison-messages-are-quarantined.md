---
id: ops-016
title: Retries are bounded and poison messages are quarantined
domain: ops
language: shared
app-type: [http-service, batch-job]
status: active
sources:
  - type: book
    title: Building Microservices
    author: Sam Newman
    year: 2021
    chapter: "Chapter 3"
    section: "Did It Work?"
---

# ops-016: Retries are bounded and poison messages are quarantined

## Intent
Prevent one permanently bad message or operation from causing endless retry loops and queue starvation.

## Applicability
Applies when the diff changes asynchronous consumers, queue workers, or background retry behavior.

## What to inspect
Retry settings, dead-letter routing, replay tooling, and failure handlers.

## Pass criteria
Retries are bounded and exhausted work goes to a dead-letter or quarantine path that operators can inspect or replay.

## Fail criteria
The diff introduces unbounded retry, immediate requeue-on-failure loops, or no sink for terminally failing messages.

## Do not flag
Synchronous one-shot retries or frameworks whose checked-in config already enforces retry bounds and dead-letter routing.

## Confidence guidance
`HIGH` when retry loops or broker settings are explicit. `MEDIUM` when framework behavior is inferred. `LOW` when broker policy lives outside the repo.

## Remediation
Set a max retry count and route exhausted items to a quarantine path.

## Pass example
```yaml
consumer:
  maxAttempts: 5
  deadLetterTopic: orders.failed
```

## Fail example
```yaml
consumer:
  requeueOnFailure: true
  maxAttempts: -1
```
