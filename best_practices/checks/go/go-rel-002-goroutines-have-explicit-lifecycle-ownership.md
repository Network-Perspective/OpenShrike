---
id: go-rel-002
title: Goroutines have explicit lifecycle ownership
domain: rel
language: go
app-type: [any]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
  - type: book
    title: Concurrency in Go
  - type: article
    title: Practical Go and Real World Advice
    author: Dave Cheney
  - type: standard
    title: Effective Go + Go Code Review Comments
  - type: standard
    title: Uber Go Style Guide
---

# go-rel-002: Goroutines have explicit lifecycle ownership

## Intent
Make every started goroutine observable, cancelable, and owned by something with a clear lifetime.

## Applicability
Applies when the diff starts goroutines, workers, pipelines, or long-running channel loops.

## What to inspect
`go` statements, context cancellation, channel closure, done signaling, waits, and error observation.

## Pass criteria
The goroutine has a clear owner, stop signal, and completion or error observation path.

## Fail criteria
The diff launches fire-and-forget work with no cancellation, no join path, or no error observation.

## Do not flag
Short-lived goroutines whose completion is visibly awaited.

## Confidence guidance
`HIGH` when detached work is directly visible. `MEDIUM` when ownership may exist elsewhere. `LOW` when lifecycle ownership is incomplete.

## Remediation
Tie the goroutine to context or channel lifecycle and observe completion explicitly.

## Pass example
```go
go func() { defer wg.Done(); select { case <-ctx.Done(): return } }()
```

## Fail example
```go
go func() { for { work() } }()
```
