# JAVA-REL-001: Outbound HTTP clients define explicit time budgets

## Intent

Java HTTP clients often need explicit connect, read, or overall timeout
configuration. Hanging remote calls create stuck threads and poor tail latency.

## Applicability

Applies when the diff introduces or changes outbound HTTP calls through
`HttpClient`, OkHttp, Spring `RestClient`/`WebClient`, Apache HTTP client, or
equivalent wrappers.

Return `unknown` when a shared client wrapper likely owns timeouts outside
scope.

## Strategy

`heuristic`

## What to inspect

1. Review outbound client construction and request paths.
2. Check whether connect/read/request timeouts or deadlines are configured.

## Pass criteria

- Remote calls are bounded by explicit client or request time budgets.

## Fail criteria

- Shared clients or request calls are introduced with no visible timeout policy.

## Do not flag

- Test code.
- One-off offline tools where hanging behavior is acceptable and obvious.

## Evidence to collect

- The client config or request path.
- The missing timeout or deadline.

## Confidence guidance

- `HIGH`: an outbound client with no visible timeout is directly shown.
- `MEDIUM`: timeout may be owned by a wrapper not shown.
- `LOW`: prefer `unknown` if client ownership is unclear.

## Remediation

- Define connect/read/overall time budgets explicitly.
- Centralize client timeout policy where possible.
