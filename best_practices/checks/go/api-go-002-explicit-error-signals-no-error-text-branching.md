---
id: api-go-002
title: Go APIs expose explicit error signals and callers do not branch on error text
domain: api
language: go
app-type: [any]
status: active
sources:
  - type: documentation
    title: Effective Go + Go Code Review Comments
    section: Multiple return values
  - type: documentation
    title: Effective Go + Go Code Review Comments
    section: In-Band Errors
  - type: documentation
    title: Google Go Style Guide
    section: "Decisions: In-band errors"
  - type: documentation
    title: Google Go Style Guide
    section: "Best Practices: Error structure"
  - type: documentation
    title: Google Go Style Guide
    section: "Decisions: Test error semantics"
---

# api-go-002: Go APIs expose explicit error signals and callers do not branch on error text

## Intent
Go callers should get structured error or absence signals instead of in-band sentinels and brittle message matching.

## Applicability
Applies to exported Go APIs, sentinel handling, and changed error-branching code in Go call sites.

## What to inspect
Return signatures, sentinel values in ordinary result positions, `errors.Is` or typed checks, and conditionals that compare `err.Error()` or formatted text.

## Pass criteria
Exported APIs return explicit error or absence information separately from normal values, and call sites branch on typed or wrapped error semantics rather than message text.

## Fail criteria
A public API uses `0`, `""`, `nil`, or another ordinary value as an implicit failure sentinel, or callers compare raw error text to decide control flow.

## Do not flag
Domain values whose zero value is the full contract, or compatibility code forced by a third-party API when a typed wrapper already exists nearby.

## Confidence guidance
`HIGH` when an in-band sentinel or string comparison is directly visible. `MEDIUM` when helper wrappers may own the real error contract. `LOW` when the value semantics are unclear.

## Remediation
Return explicit `error` or boolean presence signals and branch on `errors.Is`, `errors.As`, or typed values instead of text.

## Pass example
```go
user, ok := cache.Get(id)
if !ok { return nil, ErrNotFound }
```

## Fail example
```go
if err != nil && err.Error() == "not found" { ... }
```
