---
id: go-arch-001
title: Context propagates across request and I/O boundaries
domain: arch
language: go
app-type: [any]
status: active
sources: []
---

# go-arch-001: Context propagates across request and I/O boundaries

## Intent
Dropping `context.Context` breaks cancellation, deadlines, tracing, and request scoping.

## Applicability
Applies to handlers, RPC methods, background tasks, database calls, and outbound I/O in Go.

## What to inspect
Changed function signatures and downstream I/O calls.

## Pass criteria
Relevant boundaries accept and forward `context.Context`.

## Fail criteria
The diff replaces a caller context with `context.Background()` or `context.TODO()` or drops it on a relevant downstream call.

## Do not flag
Tiny pure helpers and true process-lifetime entrypoints.

## Confidence guidance
`HIGH` when the caller context is directly discarded. `MEDIUM` when a downstream API likely accepts context. `LOW` when no real boundary is visible.

## Remediation
Accept `ctx context.Context` and forward it.

## Pass example
```go
func (s *Server) GetUser(ctx context.Context, id string) (*User, error) { return s.repo.LoadUser(ctx, id) }
```

## Fail example
```go
func (s *Server) GetUser(id string) (*User, error) { return s.repo.LoadUser(context.Background(), id) }
```
