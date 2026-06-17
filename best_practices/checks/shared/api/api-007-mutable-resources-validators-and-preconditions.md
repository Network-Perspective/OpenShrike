---
id: api-007
title: Mutable resources expose validators and honor preconditions
domain: api
language: shared
app-type: [http-service]
status: active
sources:
  - type: standard
    title: Microsoft REST API Guidelines; Zalando RESTful API Guidelines
---

# api-007: Mutable resources expose validators and honor preconditions

## Intent
Optimistic concurrency requires clients to observe a validator and have the server enforce it before overwriting state.

## Applicability
Applies when the diff adds or changes GET, PUT, PATCH, or DELETE operations on mutable resources.

## What to inspect
Response validators such as `ETag`, request handling for `If-Match` or `If-None-Match`, response codes for stale writes, and tests for concurrent updates.

## Pass criteria
Mutable-resource reads or updates return a validator, and stale conditional writes fail with the appropriate precondition response instead of silently overwriting newer state.

## Fail criteria
The API writes mutable resources with no exposed validator, or ignores advertised precondition headers and unconditionally updates state.

## Do not flag
Immutable resources, append-only ingestion, or APIs that clearly use an equivalent version field in the request body instead of HTTP validators.

## Confidence guidance
`HIGH` when validators or missing precondition checks are directly visible. `MEDIUM` when shared middleware may own part of the behavior. `LOW` when the update path is indirect.

## Remediation
Return a validator such as `ETag` and evaluate relevant preconditions before writing mutable resources.

## Pass example
```http
HTTP/1.1 200 OK
ETag: "v7"
```

## Fail example
```typescript
const updated = await repo.update(req.params.id, req.body);
res.status(200).json(updated);
```
