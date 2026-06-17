---
id: java-rel-002
title: Thread interrupts are not swallowed
domain: rel
language: java
app-type: [any]
status: active
sources:
  - type: documentation
    title: Error Prone bug patterns documentation
  - type: book
    title: Java Concurrency in Practice
---

# java-rel-002: Thread interrupts are not swallowed

## Intent
Preserve Java interruption as a real cancellation and shutdown signal.

## Applicability
Applies to code that catches `InterruptedException` or manages interruptible blocking work.

## What to inspect
Catches, loop exits, future cancellation, and whether interrupted status is restored or propagated.

## Pass criteria
Interrupted work exits promptly or restores the interrupted status for outer layers.

## Fail criteria
The diff catches `InterruptedException` and continues as though nothing happened.

## Do not flag
Top-level shutdown handlers that intentionally stop immediately.

## Confidence guidance
`HIGH` when swallowed interrupts are directly visible. `MEDIUM` when higher-level cancellation is partly inferred. `LOW` when ownership is unclear.

## Remediation
Restore interrupted status or translate interruption into an explicit higher-level cancellation path.

## Pass example
```java
catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
```

## Fail example
```java
catch (InterruptedException e) { }
```
