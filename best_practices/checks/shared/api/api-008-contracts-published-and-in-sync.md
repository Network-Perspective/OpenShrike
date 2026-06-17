---
id: api-008
title: Machine-readable API contracts stay published and in sync with implementation
domain: api
language: shared
app-type:
  - any
status: active
sources:
  - type: book
    title: Design and Build Great Web APIs
    author: Mike Amundsen
  - type: book
    title: Building Microservices
    author: Sam Newman
    year: 2021
---

# api-008: Machine-readable API contracts stay published and in sync with implementation

## Intent
When implementation and contract artifacts drift apart, clients, generators, mocks, and tests all use the wrong interface.

## Applicability
Applies when the repository contains machine-readable API or service contracts such as OpenAPI, protobuf, JSON Schema, or similar files, and the diff changes public behavior.

## What to inspect
Contract artifacts, route declarations, request and response DTOs, schema files, and generated-documentation entrypoints.

## Pass criteria
Public route, method, request, and response changes are reflected in the machine-readable contract stored in the repository.

## Fail criteria
The diff changes published API behavior but leaves the repository contract artifact stale or missing.

## Do not flag
Repos that intentionally generate and store the authoritative contract elsewhere, or pure implementation refactors that do not change visible behavior.

## Confidence guidance
`HIGH` when the implementation change and stale contract artifact are both visible. `MEDIUM` when the contract is composed from shared fragments. `LOW` when it is unclear whether the changed endpoint is published.

## Remediation
Update the machine-readable contract in the same change that alters the public behavior.

## Pass example
```yaml
paths:
  /users:
    post:
      requestBody:
        content:
          application/json:
            schema:
              properties:
                postalCode:
                  type: string
```

## Fail example
```javascript
app.post("/users", (req, res) => {
  const { email, postalCode } = req.body;
});
```
