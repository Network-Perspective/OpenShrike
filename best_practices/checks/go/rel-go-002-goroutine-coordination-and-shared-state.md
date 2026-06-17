---
id: rel-go-002
title: Goroutine coordination and shared state are synchronized explicitly
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
---

# rel-go-002: Goroutine coordination and shared state are synchronized explicitly

## Intent
Prevent races, wrong work assignment, channel lifecycle bugs, and `WaitGroup` mis-ordering in Go concurrency.

## Applicability
Applies when the diff introduces shared mutable state, channels, goroutine fan-out, or `WaitGroup` coordination.

## What to inspect
Loop-variable capture, `WaitGroup.Add`, channel ownership, pointer receivers on synchronized state, and synchronization around shared maps or slices.

## Pass criteria
Shared state is synchronized or confined, goroutine coordination uses explicit ownership rules, and `WaitGroup.Add` happens before goroutine launch.

## Fail criteria
The diff captures changing loop variables, mutates shared state unsafely, misorders `WaitGroup.Add`, or leaves channel ownership ambiguous.

## Do not flag
Single-threaded code paths and short-lived goroutines with fully local state.

## Confidence guidance
`HIGH` when the race or coordination bug is directly visible. `MEDIUM` when ownership is inferred from nearby code. `LOW` when synchronization lives elsewhere.

## Remediation
Add synchronization or confinement, call `Add` before launch, and keep channel close ownership with one producer side.

## Pass example
```go
wg.Add(1)
go func(v string) { defer wg.Done(); use(v) }(value)
```

## Fail example
```go
go func() { wg.Add(1); use(value) }()
```
