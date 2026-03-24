# BP-TEST-002: Critical paths must have deterministic tests

## Intent

Flaky, time-sensitive, or order-dependent tests reduce trust in automation and
slow teams down. Critical behaviors should be tested in a way that does not
depend on the wall clock, random timing, or external availability.

## Applicability

Applies to time-sensitive, retry-sensitive, scheduling-sensitive, concurrent,
or otherwise nondeterministic behaviors.

Return `unknown` when the changed tests are not time- or coordination-sensitive.

## Strategy

`heuristic`

## What to inspect

1. Review changed tests for direct use of the real clock, arbitrary sleeps,
   nondeterministic ordering, or unstable external timing.
2. Check whether the system under test exposes fakeable clocks, schedulers,
   queues, or signals.

## Pass criteria

- Tests control time and sequencing explicitly.
- Assertions do not depend on arbitrary delays or race-prone timing windows.

## Fail criteria

- Tests use wall-clock time or sleep-based coordination for critical behavior.
- A critical path is left covered only by flaky or timing-dependent tests.

## Do not flag

- Truly end-to-end suites explicitly isolated from default CI.
- Small bounded waits where the test is not asserting time-sensitive behavior.

## Evidence to collect

- The nondeterministic test technique.
- The behavior being asserted through timing rather than control.

## Confidence guidance

- `HIGH`: the test directly relies on real time or arbitrary sleeps.
- `MEDIUM`: flakiness risk is strong but some control helpers are out of scope.
- `LOW`: prefer `unknown` if the path is not clearly critical.

## Remediation

- Inject controllable time or scheduling.
- Replace sleep-based waiting with explicit signals, fakes, or deterministic
  hooks.
