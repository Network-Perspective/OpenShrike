# JAVA-REL-002: Thread interrupts are not swallowed

## Intent

Interrupted status is part of thread control flow in Java. Catching
`InterruptedException` and ignoring it breaks cancellation, shutdown, and
cooperative concurrency.

## Applicability

Applies to worker, scheduler, blocking I/O, and concurrency code that catches
`InterruptedException`.

Return `unknown` when the diff does not touch interruptible code.

## Strategy

`static`

## What to inspect

1. Review `catch (InterruptedException ...)` blocks.
2. Check whether the thread interrupt is restored or the method exits promptly.

## Pass criteria

- Interrupts are propagated, translated carefully, or restored with
  `Thread.currentThread().interrupt()`.

## Fail criteria

- `InterruptedException` is caught and ignored.
- Worker loops continue as though nothing happened after interruption.

## Do not flag

- Top-level shutdown handlers that intentionally stop execution immediately.
- Cases where interruption is translated into a higher-level cancellation signal
  and that is visible.

## Evidence to collect

- The interrupt-catching block.
- The missing restore/exit behavior.

## Confidence guidance

- `HIGH`: swallowed interrupt is directly visible.
- `MEDIUM`: higher-level cancellation may exist, but is not visible.
- `LOW`: prefer `unknown` if concurrency ownership is unclear.

## Remediation

- Restore interrupted status or propagate cancellation.
- Exit loops and blocking paths promptly on interrupt.
