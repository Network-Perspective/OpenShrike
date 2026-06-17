---
id: api-002
title: Public resource identifiers remain stable and independent of mutable business fields
domain: api
language: shared
app-type: [http-service]
status: active
sources:
  - type: book
    title: API Design Patterns
    author: John J. Geewax
    year: 2021
---

# api-002: Public resource identifiers remain stable and independent of mutable business fields

## Intent
Changing the canonical identifier of an exposed resource breaks links, caches, client references, and downstream integrations.

## Applicability
Applies when the diff introduces or changes a public resource key, route parameter, or lookup field used as the canonical external identifier.

## What to inspect
Route templates, public DTOs, persistence identifiers, rename flows, and whether exposed IDs are derived from mutable names or slugs.

## Pass criteria
Public resources use stable identifiers that continue working after display-name or business-field changes.

## Fail criteria
The external contract keys a resource by a mutable business field such as a title, email address, or slug that the system expects to rename.

## Do not flag
Internal-only identifiers, aliases that are explicitly secondary, or stable slugs with a visible immutable-generation contract.

## Confidence guidance
`HIGH` when a mutable business field is used directly as the published resource key. `MEDIUM` when mutability is inferred from surrounding code. `LOW` when identifier ownership is unclear.

## Remediation
Expose a stable identifier and keep mutable business fields as attributes or secondary lookup keys.

## Pass example
```yaml
/users/{userId}:
  get: {}
```

## Fail example
```yaml
/users/{email}:
  get: {}
```
