# BP-OPS-001: Services expose meaningful health signals

## Intent

Liveness should show the process is running. Readiness should show whether the
service can actually do its job. Systems that expose only trivial health checks
hide dependency failures until traffic is already failing.

## Applicability

Applies to deployable services, workers, APIs, and other long-lived runtime
processes with external dependencies.

Return `unknown` for libraries and tiny one-shot tools.

## Strategy

`heuristic`

## What to inspect

1. Review deployment-facing services and their critical dependencies.
2. Check whether readiness/liveness or equivalent health signals reflect those
   dependencies where appropriate.

## Pass criteria

- The service exposes health signals appropriate to its runtime model.
- Critical dependencies that determine whether the service can accept work are
  represented in readiness checks or equivalent startup/traffic gates.

## Fail criteria

- A long-lived service exposes no meaningful health signal.
- A health endpoint exists but ignores obvious critical dependencies.

## Do not flag

- Libraries.
- Optional dependencies that are clearly allowed to degrade gracefully.
- Short-lived batch tools.

## Evidence to collect

- The deployable service and its critical dependencies.
- The missing or trivial health signaling.

## Confidence guidance

- `HIGH`: critical dependency use is clear and meaningful health signaling is
  absent.
- `MEDIUM`: dependency criticality is inferred from code or naming.
- `LOW`: prefer `unknown` if runtime topology is unclear.

## Remediation

- Add readiness/liveness or equivalent health signals.
- Include critical dependencies where they govern service readiness.
