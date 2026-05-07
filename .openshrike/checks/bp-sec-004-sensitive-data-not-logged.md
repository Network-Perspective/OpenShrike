# BP-SEC-004: Sensitive data is not emitted to logs or traces

## Intent

Telemetry should help diagnose systems without leaking secrets, credentials, or
regulated data into wide-access observability stores.

## Applicability

Applies when the diff adds or changes logging, tracing, or audit emission around
authentication, billing, personal data, payload capture, or credentials.

Return `unknown` when the payload shape of logged objects is not visible.

## Strategy

`heuristic`

## What to inspect

1. Review new log and trace statements.
2. Check whether raw payloads, auth headers, tokens, passwords, payment data, or
   personal data are emitted.

## Pass criteria

- Logs use safe identifiers and redacted or minimized fields.

## Fail criteria

- Secrets, tokens, raw auth headers, full sensitive bodies, or regulated data
  are emitted without a compelling and controlled reason.

## Do not flag

- Non-sensitive identifiers needed for diagnosis.
- Explicitly redacted values.
- Narrow audit events designed for sensitive access logging with controlled
  retention and scope.

## Evidence to collect

- The telemetry statement.
- The sensitive field or payload being emitted.

## Confidence guidance

- `HIGH`: the sensitive value is directly logged.
- `MEDIUM`: the logged object likely contains sensitive fields, but shape is
  partly inferred.
- `LOW`: prefer `unknown` if object contents are opaque.

## Remediation

- Log only safe identifiers.
- Redact, hash, or omit sensitive fields.
- Avoid whole-object payload logging on sensitive paths.
