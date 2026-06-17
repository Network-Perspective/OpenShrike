---
id: api-go-005
title: Go libraries do not register command-line flags outside main packages
domain: api
language: go
app-type: [library]
status: active
sources:
  - type: guide
    title: Google Go Style Guide
---

# api-go-005: Go libraries do not register command-line flags outside main packages

## Intent
Imported packages should not mutate process-wide CLI configuration behind the caller's back.

## Applicability
Applies when the diff adds or changes Go packages that may be imported by other binaries or libraries.

## What to inspect
Calls to `flag.*Var`, package `init` functions, and whether the changed package is a `main` package or a reusable library.

## Pass criteria
Flag registration is confined to `main` packages or other clearly top-level application wiring code.

## Fail criteria
A reusable library package registers process-wide flags, especially in `init`, forcing every importer to inherit global CLI behavior.

## Do not flag
Test-only binaries, internal tools whose package is itself the top-level binary, or compatibility shims that merely read already-registered flags.

## Confidence guidance
`HIGH` when a non-main package directly registers flags. `MEDIUM` when build tags or generated wrappers obscure the package role. `LOW` when the package is probably binary-only but not obvious.

## Remediation
Move flag registration to the top-level `main` package and pass configuration into the library explicitly.

## Pass example
```go
var port = flag.Int("port", 8080, "listen port")

func main() { flag.Parse() }
```

## Fail example
```go
func init() { flag.String("dsn", "", "database url") }
```
