---
id: bp-sec-004
title: Sensitive data is not emitted to logs or traces
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Alice and Bob Learn Application Security
    author: Tanya Janca
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: standard
    title: OWASP Logging Cheat Sheet + OWASP Top 10 A09 (Logging & Monitoring Failures)
  - type: book
    title: Production-Ready Microservices
    author: Susan Fowler
  - type: standard
    title: Rails Security Guide
  - type: book
    title: Secure by Design
    author: Dan Bergh Johnsson, Daniel Deogun, Daniel Sawano
  - type: article
    title: "Survive The Deep End: PHP Security"
  - type: standard
    title: OWASP Proactive Controls
---

# bp-sec-004: Sensitive data is not emitted to logs or traces

## Intent
Telemetry should help diagnose systems without leaking tokens, credentials, secrets, PII, or raw sensitive payloads into wide-access stores.

## Applicability
Applies when the diff adds or changes logging, tracing, or audit emission around authentication, payments, personal data, request or response capture, or credentials. Return `unknown` when logged object shape is not visible.

## What to inspect
Log and trace statements, request or response dumping, object serialization into telemetry, and whether sensitive fields are redacted or omitted.

## Pass criteria
Logs and traces use safe identifiers and redacted, hashed, minimized, or omitted sensitive fields.

## Fail criteria
Secrets, tokens, raw auth headers, full sensitive bodies, private keys, or regulated data are emitted, or untrusted text is written to logs without sanitization.

## Do not flag
Non-sensitive identifiers needed for diagnosis. Explicitly redacted values. Narrow audit events with controlled scope and retention.

## Confidence guidance
`HIGH` when the sensitive value is directly emitted. `MEDIUM` when the logged object likely contains sensitive fields. `LOW` when object contents are opaque.

## Remediation
Log only safe identifiers, redact or hash sensitive values, and avoid whole-object payload logging on sensitive paths.

## Pass example
```python
logger.info("login_failed", extra={"user_id": user_id, "token_suffix": token[-4:]})
```

## Fail example
```python
logger.info("login_failed", extra={"password": password, "authorization": auth_header})
```
