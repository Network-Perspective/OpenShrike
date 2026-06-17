---
id: rel-go-001
title: Context flows per call and detached work gets its own lifetime
domain: rel
language: go
app-type: [any]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
  - type: book
    title: Concurrency in Go
  - type: standard
    title: Effective Go + Go Code Review Comments
  - type: article
    title: "Go official blog: Contexts and structs"
  - type: standard
    title: Google Go Style Guide
---

# rel-go-001: Context flows per call and detached work gets its own lifetime

## Intent
Keep Go request-scoped cancellation and deadlines attached to the call chain without leaking them into reusable objects or detached work.

## Applicability
Applies to Go request handlers, I/O paths, and background work spawned from request code.

## What to inspect
Function signatures, stored contexts, derived contexts, background goroutines, and cancel calls.

## Pass criteria
Request-scoped work accepts and forwards `context.Context` per call, derived contexts are canceled, and detached work uses its own deliberate lifetime instead of the request context.

## Fail criteria
The diff drops caller context, stores it in reusable structs, forgets to cancel derived contexts, or uses request context for detached background work.

## Do not flag
Purely synchronous helpers with no blocking or long-lived work.

## Confidence guidance
`HIGH` when the bad context flow is directly visible. `MEDIUM` when downstream propagation is partly hidden. `LOW` when the boundary is incomplete.

## Remediation
Pass context per call, `defer cancel()` on derived contexts, and create a new owned context for detached work.

## Pass example
```go
ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()
```

## Fail example
```go
type Client struct { ctx context.Context }
```
