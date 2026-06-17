---
id: data-010
title: Durable or cross-process data uses versionable formats and mixed-version-safe evolution
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
    chapter: Encoding and Evolution
---

# data-010: Durable or cross-process data uses versionable formats and mixed-version-safe evolution

## Intent
Keep durable and cross-process data decodable and safe across rolling upgrades and long-lived storage.

## Applicability
Applies to stored records, events, messages, snapshots, and replicated files. Return `unknown` when format ownership is fully external.

## What to inspect
Serialization formats, schema files, record metadata, unknown-field handling, and compatibility rules for mixed readers and writers.

## Pass criteria
Durable data uses explicit versionable formats, readers tolerate compatible evolution, writer-schema identity is available when required, and read-modify-write flows preserve unknown fields.

## Fail criteria
Code persists runtime-native object serialization, introduces incompatible schema changes without compatibility support, or rewrites records in ways that drop newer unknown fields.

## Do not flag
Purely transient in-memory serialization that never crosses process or durability boundaries.

## Confidence guidance
`HIGH` when native object serialization or unsafe rewrite behavior is visible. `MEDIUM` when compatibility metadata may be external. `LOW` when only interface types are shown.

## Remediation
Use explicit schema-driven formats and preserve backward or forward compatibility during mixed-version operation.

## Pass example
```json
{ "schema_version": 2, "name": "Ava", "nickname": null }
```

## Fail example
```java
out.writeObject(order);
```
