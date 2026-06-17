---
id: api-009
title: Published API contracts remain backward compatible within a version
domain: api
language: shared
app-type:
  - http-service
status: active
sources:
  - type: book
    title: API Design Patterns
  - type: book
    title: Building Evolutionary Architectures
  - type: book
    title: Building Microservices
    author: Sam Newman
    year: 2021
  - type: book
    title: Design and Build Great Web APIs
    author: Mike Amundsen
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
    chapter: "Chapter 4: Encoding and Evolution"
  - type: article
    title: Hyrum's Law + Software Engineering at Google deprecation/compat chapters
  - type: standard
    title: Microsoft REST API Guidelines + Zalando RESTful API Guidelines
  - type: book
    title: Modern Software Engineering
  - type: standard
    title: OpenAPI Specification docs + oasdiff / openapi-diff tool documentation
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
---

# api-009: Published API contracts remain backward compatible within a version

## Intent
Mixed-version deployments and deployed clients must continue working until a deliberate versioned migration happens.

## Applicability
Applies when the diff changes a published route, method, request or response schema, serialized payload, or interface behavior in the current supported version.

## What to inspect
Contract diffs, route declarations, DTOs, request validation rules, response fields, status codes, accepted values, default behavior, and any compatibility shims or dual-read or dual-write logic.

## Pass criteria
Current-version changes are additive or compatibility-preserving, and any incompatible change is introduced behind a new version, additive alias, or visible migration path.

## Fail criteria
The diff removes or renames paths or fields, adds new required inputs to an existing operation, narrows accepted values, changes a field or parameter meaning in place, changes a success code incompatibly, or otherwise breaks existing callers without a visible compatibility path.

## Do not flag
Brand-new endpoints, additive optional inputs with safe defaults, new versions that leave the old contract intact, or bug fixes that restore already documented behavior.

## Confidence guidance
`HIGH` when the before-and-after contract is directly visible. `MEDIUM` when compatibility depends on generated artifacts or helpers. `LOW` when consumer status is only partly visible.

## Remediation
Keep the current-version contract backward compatible, or add a new version and a migration path instead of changing the old contract in place.

## Pass example
```yaml
Order:
  required: [id, status]
  properties:
    customer_note:
      type: string
      nullable: true
```

## Fail example
```yaml
Order:
  required: [id, status, customer_note]
```
