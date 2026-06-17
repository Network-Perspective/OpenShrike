---
id: csharp-sec-007
title: Logs do not expose secrets or sensitive payloads
domain: sec
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-sec-007: Logs do not expose secrets or sensitive payloads

## Intent
Operational logs should help diagnose problems without leaking tokens, credentials, regulated data, or full sensitive payloads into telemetry systems.

## Applicability
Applies when the diff adds or changes logging around authentication, payments, personal data, request or response bodies, or third-party credentials. Return `unknown` when payload shape is not visible.

## What to inspect
Log statements, exception handling, raw request bodies, headers, secrets, PII, and whether selective projection or redaction is used.

## Pass criteria
Logs include stable identifiers and safe context, and sensitive values are omitted, truncated, hashed, or redacted.

## Fail criteria
Passwords, tokens, API keys, connection strings, private keys, raw `Authorization` headers, or full sensitive bodies are logged.

## Do not flag
Safe identifiers such as order IDs or user IDs. Explicitly redacted values. Local-only tooling outside application telemetry.

## Confidence guidance
`HIGH` when the sensitive value is directly logged. `MEDIUM` when the object likely contains sensitive fields. `LOW` when the logged type is opaque.

## Remediation
Log only minimum diagnostic fields and avoid serializing whole request or response objects.

## Pass example
```csharp
_logger.LogInformation("Payment rejected for customer {CustomerId}", customerId);
```

## Fail example
```csharp
_logger.LogWarning("Auth failed for {Email} with token {Token}", request.Email, request.AccessToken);
```
