# BP-REL-001: Outbound dependencies have explicit time budgets

## Intent

Remote calls, polling loops, and long waits should be bounded. Systems that
wait forever create stuck requests, resource leaks, and unstable tail latency.

## Applicability

Applies when the diff introduces or materially changes outbound I/O, waiting,
polling, or blocking on external systems.

Return `unknown` when the relevant client wrapper or timeout policy is outside
visible scope.

## Strategy

`heuristic`

## What to inspect

1. Find outbound calls and waits introduced or changed in the diff.
2. Check for timeouts, deadlines, request cancellation, or equivalent budgets.

## Pass criteria

- Remote work is bounded by explicit timeout, deadline, or cancellation flow.

## Fail criteria

- Remote calls or waits have no visible bound.
- New wait loops rely on effectively infinite or accidental defaults.

## Do not flag

- Immediate in-memory work.
- Paths already clearly bounded by caller cancellation.

## Evidence to collect

- The outbound call or wait site.
- The missing time budget.

## Confidence guidance

- `HIGH`: an unbounded remote or waiting path is directly visible.
- `MEDIUM`: timeout handling may exist elsewhere, but is not visible.
- `LOW`: prefer `unknown` if the client abstraction hides policy.

## Remediation

- Add explicit timeout, deadline, or caller cancellation.
- Make wait loops cancellation-aware.
