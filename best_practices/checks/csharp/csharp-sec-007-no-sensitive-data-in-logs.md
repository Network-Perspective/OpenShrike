# CSHARP-SEC-007: Logs do not expose secrets or sensitive payloads

## Intent

Operational logs should help diagnose problems without leaking tokens,
credentials, regulated data, or full sensitive payloads into telemetry systems.

## Applicability

Applies when the diff adds or changes logging around authentication, payments,
personal data, request/response bodies, or third-party credentials.

Return `unknown` when logging code is touched only indirectly and the payload
shape is not visible.

## Strategy

`heuristic`

## What to inspect

1. Review log statements and exception handling in the changed code.
2. Check whether raw request bodies, headers, secrets, or PII are logged.
3. Check whether redaction or selective projection is used instead.

## Pass criteria

- Logs include stable identifiers and safe context.
- Sensitive values are omitted, truncated, hashed, or redacted.

## Fail criteria

- Passwords, tokens, API keys, connection strings, or private keys are logged.
- Raw `Authorization` headers or full sensitive request bodies are logged.
- Logs emit personal or payment data with no clear operational need.

## Do not flag

- Safe identifiers such as order IDs or user IDs where they are expected.
- Explicitly redacted values.
- Local-only diagnostic tooling outside application telemetry.

## Evidence to collect

- The log statement.
- The sensitive field or payload being emitted.

## Confidence guidance

- `HIGH`: the sensitive value is directly logged.
- `MEDIUM`: the logged object likely contains sensitive fields, but the exact
  payload shape is partly inferred.
- `LOW`: prefer `unknown` if the logged type is opaque.

## Remediation

- Log only the minimum fields needed for diagnosis.
- Redact or hash sensitive values.
- Avoid serializing whole request/response objects into logs.

## Pass example

```csharp
_logger.LogInformation("Payment rejected for customer {CustomerId}", customerId);
```

## Fail example

```csharp
_logger.LogWarning("Auth failed for {Email} with token {Token}", request.Email, request.AccessToken);
```
