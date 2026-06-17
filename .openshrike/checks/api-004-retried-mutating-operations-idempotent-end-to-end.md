---
id: api-004
title: Retried mutating operations are idempotent end-to-end
domain: api
language: shared
app-type: [http-service]
status: active
sources:
  - type: article
    title: Making retries safe with idempotent APIs
---

# api-004: Retried mutating operations are idempotent end-to-end

## Intent
Retries after timeouts or lost responses should not duplicate externally visible side effects.

## Applicability
Applies when the diff adds or changes a retriable create or mutate operation, or implements the server-side deduplication path for idempotency keys.

## What to inspect
Request models, idempotency-key handling, duplicate detection, transaction boundaries, stored request fingerprints, and mismatch error paths.

## Pass criteria
Retriable mutations accept an idempotency key or equivalent deduplication handle, store the dedup state atomically with the mutation, and reject key reuse with different parameters.

## Fail criteria
A retriable mutation has no deduplication contract, stores dedup state and the side effect separately, or accepts the same key for different request parameters.

## Do not flag
Naturally idempotent operations already keyed by a stable client-chosen identifier, or internal one-shot paths with no retry surface.

## Confidence guidance
`HIGH` when the public contract and server implementation are both visible. `MEDIUM` when some idempotency behavior may exist in shared middleware. `LOW` when only part of the retry surface is shown.

## Remediation
Require an idempotency key, persist it atomically with the mutation, and compare subsequent requests to the original intent.

## Pass example
```python
with db.transaction():
    db.insert_idempotency_key(key, request_hash)
    db.insert_order(order_id, customer_id)
```

## Fail example
```python
db.insert_idempotency_key(key, request_hash)
db.insert_order(order_id, customer_id)
```
