# PYTHON-REL-001: Outbound HTTP calls set explicit timeouts

## Intent

Python HTTP clients often default to no timeout or unsafe defaults. Production
code should make network time budgets explicit.

## Applicability

Applies when the diff introduces or changes outbound HTTP calls through
`requests`, `httpx`, `aiohttp`, `urllib3`, cloud SDK wrappers, or equivalent
clients.

Return `unknown` when a wrapper likely owns the timeout but is outside scope.

## Strategy

`static`

## What to inspect

1. Review outbound HTTP calls or client construction.
2. Check whether a timeout or deadline is provided explicitly.

## Pass criteria

- Each outbound path or shared client configuration has an explicit timeout.

## Fail criteria

- `requests.get/post/...` or equivalent are called without timeout.
- Shared clients are constructed with effectively unbounded timeout behavior.

## Do not flag

- Test code.
- One-off offline scripts where hanging behavior is acceptable and obvious.

## Evidence to collect

- The outbound call or client config.
- The missing timeout.

## Confidence guidance

- `HIGH`: an outbound HTTP call without timeout is directly visible.
- `MEDIUM`: timeout may be owned by a wrapper not shown in scope.
- `LOW`: prefer `unknown` if the call path is incomplete.

## Remediation

- Add explicit timeouts at the call or client boundary.
- Keep network budgets centralized in shared client construction where possible.
