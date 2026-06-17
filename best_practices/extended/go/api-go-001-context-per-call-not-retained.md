---
id: api-go-001
title: Go APIs accept per-call context and do not retain it on reusable objects
domain: api
language: go
app-type: [any]
status: active
sources:
  - type: standard
    title: Effective Go; Go Code Review Comments
  - type: article
    title: Go official blog articles on contexts and structs, pipelines and cancellation, and goroutine lifecycle
  - type: standard
    title: Google Go Style Guide
---

# api-go-001: Go APIs accept per-call context and do not retain it on reusable objects

## Intent
Go APIs should give callers per-call control over cancellation, deadlines, and request-scoped metadata.

## Applicability
Applies to public and internal Go call signatures, constructors, and reusable client or service types.

## What to inspect
Method signatures, stored struct fields, constructors that accept `context.Context`, and compatibility shims for retrofitted context-aware APIs.

## Pass criteria
Blocking or externally visible operations accept `context.Context` directly per call, and reusable structs do not retain request-scoped context for later use.

## Fail criteria
A reusable object stores `context.Context`, a constructor carries a context that governs later operations, or a new API invents its own context abstraction instead of using `context.Context`.

## Do not flag
Single-request helper values that exist only within one call, or constructor-time setup work that uses the context immediately and does not retain it.

## Confidence guidance
`HIGH` when a struct field or signature directly stores or omits context incorrectly. `MEDIUM` when compatibility wrappers may exist elsewhere. `LOW` when the public boundary is incomplete.

## Remediation
Pass `context.Context` per operation, keep it out of reusable struct state, and add explicit context-aware variants when retrofitting older APIs.

## Pass example
```go
func (c *Client) Fetch(ctx context.Context, id string) error { ... }
```

## Fail example
```go
type Client struct { ctx context.Context }
```
