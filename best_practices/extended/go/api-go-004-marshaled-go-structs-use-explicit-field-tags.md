---
id: api-go-004
title: Marshaled Go structs use explicit field tags
domain: api
language: go
app-type: [any]
status: active
sources:
  - type: guide
    title: Uber Go Style Guide
    author: Uber
---

# api-go-004: Marshaled Go structs use explicit field tags

## Intent
Wire contracts should not depend on Go field-name defaults that change when a field is renamed or when tag defaults differ across encoders.

## Applicability
Applies when the diff adds or changes Go structs serialized to JSON, YAML, query params, or similar external formats.

## What to inspect
Exported struct fields on marshaled types, explicit tags, rename behavior, omitempty behavior, and compatibility with existing encoded payloads.

## Pass criteria
Serialized Go structs use explicit field tags for externally visible names and behavior.

## Fail criteria
A new or changed externally marshaled struct relies on default field-name mapping instead of an explicit tag.

## Do not flag
Internal-only structs that never cross a serialization boundary, or generated code whose source schema owns the tag contract elsewhere.

## Confidence guidance
`HIGH` when a marshaled struct field is visible with no tag. `MEDIUM` when serializer usage is inferred. `LOW` when the struct may be internal-only.

## Remediation
Add explicit field tags to serialized structs so the wire name remains deliberate and reviewable.

## Pass example
```go
type User struct {
    UserID string `json:"user_id"`
}
```

## Fail example
```go
type User struct {
    UserID string
}
```
