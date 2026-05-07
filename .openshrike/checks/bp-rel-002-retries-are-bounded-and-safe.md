# BP-REL-002: Retries are bounded, deliberate, and safe for the operation

## Intent

Retries can improve resilience, but blind retries can multiply failures or
duplicate side effects. Retry behavior should be explicit, bounded, and safe
for the operation being retried.

## Applicability

Applies when the diff introduces or changes retry logic for remote dependencies,
jobs, or distributed workflows.

Return `unknown` when idempotency or side-effect safety is not visible.

## Strategy

`heuristic`

## What to inspect

1. Find retry loops, retry libraries, queue redelivery handling, or resilient
   client configuration.
2. Check for bounded attempts, backoff, jitter, and idempotency awareness.

## Pass criteria

- Retries are bounded and use backoff where appropriate.
- The retried operation is safe to retry, or the code explicitly chooses not to
  retry because it is not safe.

## Fail criteria

- Retries are unbounded.
- The diff adds blind retries around non-idempotent or side-effecting work.
- Tight retry loops re-execute immediately under failure.

## Do not flag

- In-memory retries with no external side effects.
- Explicit no-retry behavior for unsafe operations.

## Evidence to collect

- The retry logic.
- The remote or side-effecting operation it wraps.

## Confidence guidance

- `HIGH`: unsafe or unbounded retry behavior is directly visible.
- `MEDIUM`: the side-effect safety of the operation is partly inferred.
- `LOW`: prefer `unknown` if idempotency is unclear.

## Remediation

- Bound retries and add backoff.
- Retry only safe operations or add idempotency protection.
