---
id: test-016
title: Fuzz drivers are deterministic and side-effect free
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Secure and Reliable Systems
    chapter: "Chapter 13"
    section: Writing Effective Fuzz Drivers
---

# test-016: Fuzz drivers are deterministic and side-effect free

## Intent
Fuzzing is only useful when the same crashing input can be replayed reliably and the harness is not polluted by unrelated I/O or side effects.

## Applicability
Applies when the diff adds or changes fuzz targets or fuzz harness helpers. Return `unknown` when the diff contains no fuzzing code.

## What to inspect
Look for ambient randomness, wall-clock behavior, filesystem or network I/O, deliberate crash logic, and other side effects inside the fuzz harness path.

## Pass criteria
The fuzz target is deterministic for the same input and does not depend on live I/O, mutable external state, or intentional crash tricks.

## Fail criteria
The harness uses ambient randomness, real network or filesystem dependencies, or other side effects that make failures hard to replay or unrelated to the input itself.

## Do not flag
Pure in-memory helper setup, framework-provided seeding, or explicit corpus loading that does not change execution semantics for the same testcase.

## Confidence guidance
`HIGH` when the fuzz target directly reads real time, live I/O, or shared state. `MEDIUM` when helpers hide the side effects. `LOW` when the harness wrapper is incomplete.

## Remediation
Keep the fuzz path pure and deterministic for a given input, and replace live dependencies with in-memory fixtures.

## Pass example
```go
func FuzzParseFrame(f *testing.F) {
    f.Fuzz(func(t *testing.T, data []byte) {
        _, _ = ParseFrame(data)
    })
}
```

## Fail example
```go
func FuzzParseFrame(f *testing.F) {
    f.Fuzz(func(t *testing.T, data []byte) {
        _, _ = http.Get("https://example.com/")
        _, _ = ParseFrame(append(data, byte(rand.Intn(255))))
    })
}
```
