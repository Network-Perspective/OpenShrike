---
id: bp-api-001
title: External APIs return machine-readable error contracts
domain: api
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: Google API Improvement Proposals
  - type: standard
    title: Microsoft REST API Guidelines and Zalando RESTful API Guidelines
  - type: book
    title: Building Microservices
  - type: book
    title: "The Site Reliability Workbook: Practical Ways to Implement SRE"
---

# bp-api-001: External APIs return machine-readable error contracts

## Intent
Clients should be able to detect failure, classify it, and decide whether to retry without scraping ad hoc text.

## Applicability
Applies to HTTP, RPC, CLI, or messaging interfaces consumed outside the current module or service boundary. Return `unknown` when the final error envelope is owned elsewhere and not visible.

## What to inspect
Changed error paths, exception mappers, OpenAPI or protobuf error schemas, status codes, machine-readable error codes, and retryable versus non-retryable failure signaling.

## Pass criteria
Normal client-visible failures use one stable structured envelope, carry machine-readable identifiers or codes, distinguish retryable from permanent failures, and avoid leaking stack traces or raw exception dumps.

## Fail criteria
The interface returns plain strings or ad hoc payloads, mixes incompatible error shapes, forces clients to match human text, or reports failed requests as successful `2xx` responses.

## Do not flag
Internal exceptions that are mapped before crossing the boundary, browser HTML flows, or alternate structured envelopes that are already consistent and documented.

## Confidence guidance
`HIGH` when the inconsistent or ad hoc payload is directly visible. `MEDIUM` when a central mapper may exist out of scope. `LOW` when contract ownership is unclear.

## Remediation
Standardize on one documented error envelope with stable codes and details that let callers branch safely.

## Pass example
```json
{
  "error": {
    "code": "ORDER_CONFLICT",
    "retryable": false,
    "message": "Order cannot be cancelled"
  }
}
```

## Fail example
```json
{ "error": "java.lang.NullPointerException at OrderService:87" }
```
