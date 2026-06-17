---
id: data-go-014
title: Mutable slices and maps do not cross ownership or lock boundaries by alias
domain: data
language: go
app-type: [any]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
  - type: standard
    title: Uber Go Style Guide
---

# data-go-014: Mutable slices and maps do not cross ownership or lock boundaries by alias

## Intent
Prevent accidental shared mutation and data races from leaking mutable slice or map storage across boundaries.

## Applicability
Applies to shared state, concurrent code, package boundaries, and exported APIs. Return `unknown` when ownership is intentionally centralized and visible.

## What to inspect
Returned slices and maps, stored references, copies at lock boundaries, and mutation after unlock.

## Pass criteria
Code deep-copies or clearly transfers ownership before mutable slices or maps cross package, struct, or lock boundaries.

## Fail criteria
Code returns or stores aliases to mutable shared slices or maps and later mutates them concurrently or outside the original ownership assumptions.

## Do not flag
Read-only immutable data or freshly allocated collections whose ownership is clearly handed off once.

## Confidence guidance
`HIGH` when the same mutable backing storage escapes a lock or shared owner. `MEDIUM` when immutability is by convention only. `LOW` when mutation sites are outside the diff.

## Remediation
Copy mutable slices and maps at boundaries unless one owner clearly retains exclusive mutation rights.

## Pass example
```go
func (s *Store) Items() []string { return append([]string(nil), s.items...) }
```

## Fail example
```go
func (s *Store) Items() []string { return s.items }
```
