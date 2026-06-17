---
id: rel-go-004
title: Package initialization is deterministic and side-effect free
domain: rel
language: go
app-type: [any]
status: active
sources:
  - type: guide
    title: Uber Go Style Guide
    author: Uber
---

# rel-go-004: Package initialization is deterministic and side-effect free

## Intent
Prevent import-time I/O, background work, and startup-order surprises in Go packages.

## Applicability
Applies when the diff adds or changes `init()` functions or package-scope initialization with side effects.

## What to inspect
`init()`, package-scope variables, I/O, goroutine launch, and environment mutation at import time.

## Pass criteria
Initialization is deterministic and free of uncontrolled I/O or background side effects.

## Fail criteria
The diff adds package import side effects such as file reads, env mutation, or goroutine startup.

## Do not flag
Pure constant or trivial in-memory initialization.

## Confidence guidance
`HIGH` when the side effect is directly visible. `MEDIUM` when helper calls hide it. `LOW` when init ownership is unclear.

## Remediation
Move side effects to an explicit startup function owned by the application.

## Pass example
```go
var defaultTimeout = 5 * time.Second
```

## Fail example
```go
func init() { go pollConfig(); _ = os.Setenv("X", "1") }
```
