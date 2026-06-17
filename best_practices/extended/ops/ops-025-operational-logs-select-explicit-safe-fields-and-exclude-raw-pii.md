---
id: ops-025
title: Operational logs select explicit safe fields and exclude raw PII
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: NIST Privacy Framework and NIST SP 800-122
  - type: book
    title: Secure by Design
    author: Dan Bergh Johnsson, Daniel Deogun, Daniel Sawano
---

# ops-025: Operational logs select explicit safe fields and exclude raw PII

## Intent
Prevent privacy leaks and log-forging surprises by recording only intentionally selected, non-sensitive fields instead of raw personal data or whole objects.

## Applicability
Applies when the diff adds or changes operational logging, tracing attributes, audit payloads, or structured telemetry for externally influenced data.

## What to inspect
Logger calls, tracing attributes, serialized objects, request or domain objects in logs, and direct logging of names, emails, IDs, or raw input.

## Pass criteria
The changed code logs explicit safe fields, and any personal data is removed, masked, hashed, tokenized, or otherwise minimized.

## Fail criteria
The diff logs full PII, whole request or domain objects with hidden sensitive fields, or unchecked external input verbatim.

## Do not flag
Dedicated access-restricted audit streams that intentionally record the minimum approved fields, or internal surrogate IDs that are not directly identifying.

## Confidence guidance
`HIGH` when the logged field or object is direct. `MEDIUM` when a helper serializes a likely sensitive model. `LOW` when object contents are not visible.

## Remediation
Log only explicit safe fields and redact or omit sensitive values.

## Pass example
```typescript
logger.info("customer lookup failed", { customerId, emailDomain: email.split("@")[1] });
```

## Fail example
```typescript
logger.info("customer lookup failed", { email, fullName, ssn });
```
