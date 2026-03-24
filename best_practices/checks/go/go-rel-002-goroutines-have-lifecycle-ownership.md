# GO-REL-002: Goroutines have explicit lifecycle ownership

## Intent

Goroutines are cheap to start and easy to leak. Background work should have a
clear owner, cancellation path, or bounded lifetime.

## Applicability

Applies when the diff starts goroutines, worker loops, background pollers, or
channel-driven concurrent work.

Return `unknown` when the goroutine lifecycle is likely owned elsewhere outside
the visible scope.

## Strategy

`heuristic`

## What to inspect

1. Review `go func()` launches and worker loops.
2. Check whether the goroutine is tied to context cancellation, channel closure,
   or another clear owner.

## Pass criteria

- Background work has explicit shutdown or completion semantics.
- Errors and exits are observed by the owning component.

## Fail criteria

- Fire-and-forget goroutines are launched with no cancellation or observation.
- Worker loops ignore context cancellation and can outlive their owner.

## Do not flag

- Short-lived goroutines whose completion is clearly awaited.
- Tests with tightly bounded concurrency helpers.

## Evidence to collect

- The goroutine launch.
- The missing lifecycle ownership or cancellation path.

## Confidence guidance

- `HIGH`: a detached goroutine with no owner is directly visible.
- `MEDIUM`: ownership may exist elsewhere, but is not shown.
- `LOW`: prefer `unknown` if the lifecycle is unclear.

## Remediation

- Tie goroutines to context or channel lifecycle.
- Observe completion and error paths explicitly.
