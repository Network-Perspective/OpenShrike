---
id: bp-api-002
title: Collection reads are bounded
domain: api
language: shared
app-type: [http-service]
status: active
sources:
  - type: book
    title: API Design Patterns
  - type: standard
    title: Google API Improvement Proposals (AIPs)
  - type: standard
    title: Microsoft REST API Guidelines; Zalando RESTful API Guidelines
---

# bp-api-002: Collection reads are bounded

## Intent
External interfaces should not accidentally expose unbounded or unstable collection reads.

## Applicability
Applies to external endpoints or commands that return collections whose size can grow beyond a small fixed set. Return `unknown` when the dataset is inherently fixed or not visible.

## What to inspect
Changed list routes, request and response shapes, page-size handling, continuation tokens, and whether the next page depends on client-reconstructed state.

## Pass criteria
Collection reads are bounded, page-size inputs have a safe maximum, and paginated responses use an opaque token or link that carries the server state needed for the next page.

## Fail criteria
A published collection endpoint returns an unbounded result, accepts an uncapped client page size, or paginates mutable data only with page numbers or offsets that make traversal unstable.

## Do not flag
Fixed-size reference data, clearly gated export flows, or non-standard search operations that are deliberately modeled outside ordinary list semantics.

## Confidence guidance
`HIGH` when the unbounded or unstable collection contract is directly visible. `MEDIUM` when growth or mutability is inferred. `LOW` when the collection is likely fixed-size.

## Remediation
Add pagination or cursoring, enforce a maximum page size, and return an opaque continuation token or link on non-final pages.

## Pass example
```json
{ "items": [{ "id": "1" }], "next_page_token": "eyJjdXJzb3IiOiIxIn0=" }
```

## Fail example
```json
{ "items": [{ "id": "1" }], "page": 1, "size": 10000 }
```
