---
id: bp-test-002
title: Critical paths must have deterministic tests
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Google Testing Blog
  - type: book
    title: Growing Object-Oriented Software, Guided by Tests
    author: Steve Freeman & Nat Pryce
  - type: book
    title: Modern Software Engineering
  - type: article
    title: My Selenium Tests Aren't Stable!
    author: Simon Stewart
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
  - type: book
    title: "xUnit Test Patterns: Refactoring Test Code"
    author: Gerard Meszaros
---

# bp-test-002: Critical paths must have deterministic tests

## Intent
Flaky, time-sensitive, or order-dependent tests reduce trust in automation and slow teams down. Critical behaviors should be tested in a way that does not depend on the wall clock, guessed delays, uncontrolled randomness, or unstable ordering.

## Applicability
Applies to time-sensitive, retry-sensitive, scheduling-sensitive, concurrent, asynchronous, or otherwise nondeterministic behaviors. Return `unknown` when the changed tests are not timing- or coordination-sensitive.

## What to inspect
Review changed tests for direct use of the real clock, arbitrary sleeps, nondeterministic ordering, unseeded randomness, or waits that ignore visible error states.

## Pass criteria
Tests control time, sequencing, randomness, and ordering explicitly. Waits are tied to observable milestones or bounded condition checks, and fail fast when the system has already reached a visible error state.

## Fail criteria
Tests use wall-clock time, arbitrary sleeps, unseeded randomness, or unstable ordering as the main oracle for critical behavior.

## Do not flag
Fake-clock advancement, bounded condition polling, property or fuzz frameworks whose replay seeds are managed by the framework, or clearly isolated soak or end-to-end suites outside the default deterministic path.

## Confidence guidance
`HIGH` when the test directly relies on real time, arbitrary sleeps, or uncontrolled randomness. `MEDIUM` when helper code may hide the nondeterminism. `LOW` when the path is not clearly critical.

## Remediation
Inject controllable time or scheduling, seed relevant randomness, normalize unordered outputs, and replace sleep-based waiting with explicit signals or bounded condition checks.

## Pass example
```go
done := make(chan struct{})
go func() {
    worker.Run()
    close(done)
}()

select {
case <-done:
case <-time.After(time.Second):
    t.Fatal("worker did not finish")
}
```

## Fail example
```go
go worker.Run()
time.Sleep(2 * time.Second)
if !worker.Finished() {
    t.Fatal("worker did not finish")
}
```
