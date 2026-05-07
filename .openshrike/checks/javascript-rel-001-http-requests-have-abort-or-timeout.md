# JAVASCRIPT-REL-001: Outbound HTTP requests have explicit cancellation or timeout

## Intent

JavaScript network calls often inherit poor timeout behavior by default.
Production requests should be bounded so the event loop does not accumulate
hanging work.

## Applicability

Applies when the diff introduces or changes outbound HTTP calls through `fetch`,
Axios, got, undici, cloud SDK wrappers, or equivalent clients.

Return `unknown` when a wrapper likely owns the timeout but is outside scope.

## Strategy

`heuristic`

## What to inspect

1. Review outbound HTTP calls or shared client configuration.
2. Check for `AbortSignal`, timeout configuration, or equivalent deadlines.

## Pass criteria

- Outbound calls are bounded by explicit timeout or abort behavior.

## Fail criteria

- Remote calls are issued with no visible timeout or abort path.
- Shared clients rely on effectively unbounded defaults.

## Do not flag

- Test code.
- One-off offline scripts where hanging behavior is clearly acceptable.

## Evidence to collect

- The outbound call or client setup.
- The missing time budget.

## Confidence guidance

- `HIGH`: an outbound HTTP request without timeout or abort is directly visible.
- `MEDIUM`: timeout may be applied by an unseen wrapper.
- `LOW`: prefer `unknown` if the request path is incomplete.

## Remediation

- Add explicit timeout or `AbortSignal` handling.
- Centralize network budgets in client creation when possible.
