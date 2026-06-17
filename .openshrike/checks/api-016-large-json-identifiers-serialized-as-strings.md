---
id: api-016
title: Potentially large JSON identifiers are serialized as strings
domain: api
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
    chapter: "Chapter 4: Encoding and Evolution"
---

# api-016: Potentially large JSON identifiers are serialized as strings

## Intent
JSON number parsing in JavaScript and many clients cannot represent large integer identifiers exactly.

## Applicability
Applies when the diff exposes external JSON contracts containing identifiers that may exceed `2^53 - 1` or otherwise depend on exact integer identity.

## What to inspect
OpenAPI schemas, JSON examples, DTO types, serialization helpers, and whether exposed identifier ranges are visibly bounded below the safe integer limit.

## Pass criteria
Large or potentially large identifiers are serialized as strings, or the repository clearly bounds them to a safe numeric range for every client.

## Fail criteria
The external JSON contract emits 64-bit or larger identifiers as numbers with no visible safe-range bound.

## Do not flag
Non-identifier numeric fields, internal binary protocols, or identifiers that are visibly guaranteed to stay within the safe integer range.

## Confidence guidance
`HIGH` when a 64-bit identifier is serialized as a JSON number. `MEDIUM` when identifier size is inferred from model types. `LOW` when range guarantees are out of scope.

## Remediation
Serialize large identifiers as strings in JSON and keep numeric-only handling inside implementation code.

## Pass example
```json
{ "userId": "9223372036854775807" }
```

## Fail example
```json
{ "userId": 9223372036854775807 }
```
