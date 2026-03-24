# GO-REL-001: HTTP clients and servers define explicit time budgets

## Intent

Go makes it easy to create HTTP clients and servers with unsafe default timeout
behavior. Production code should define request and connection time budgets
explicitly.

## Applicability

Applies when the diff introduces or changes outbound HTTP clients or inbound
HTTP servers.

Return `unknown` when shared wrappers likely own timeout policy outside scope.

## Strategy

`heuristic`

## What to inspect

1. Review `http.Client`, transport config, and server construction.
2. Check for request timeouts, idle timeouts, read/write timeouts, or context
   deadlines as appropriate.

## Pass criteria

- Client and server time budgets are explicit for the changed path.

## Fail criteria

- New HTTP clients or servers rely on unbounded or accidental defaults.

## Do not flag

- Test servers.
- Short-lived offline tools where timeout policy is clearly irrelevant.

## Evidence to collect

- The client or server construction.
- The missing timeout config.

## Confidence guidance

- `HIGH`: timeout-free client or server setup is directly visible.
- `MEDIUM`: shared wrappers may set timeouts outside scope.
- `LOW`: prefer `unknown` if ownership is unclear.

## Remediation

- Define explicit client and server timeouts.
- Use request contexts to bound work further where needed.
