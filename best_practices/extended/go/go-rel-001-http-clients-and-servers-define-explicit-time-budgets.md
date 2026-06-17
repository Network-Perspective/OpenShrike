---
id: go-rel-001
title: HTTP clients and servers define explicit time budgets
domain: rel
language: go
app-type: [any]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
---

# go-rel-001: HTTP clients and servers define explicit time budgets

## Intent
Avoid Go's unsafe default timeout behavior on HTTP clients and servers.

## Applicability
Applies to changed `http.Client`, transport, and server construction.

## What to inspect
Client timeouts, context deadlines, and server read, write, idle, or header timeouts.

## Pass criteria
The changed HTTP path has explicit time budgets.

## Fail criteria
The diff adds a client or server that relies on default unbounded timeout behavior.

## Do not flag
Test servers and short-lived offline tools.

## Confidence guidance
`HIGH` when timeout-free setup is directly visible. `MEDIUM` when a wrapper may own timeouts. `LOW` when ownership is unclear.

## Remediation
Define explicit client and server timeouts and use request contexts for per-call bounds.

## Pass example
```go
client := &http.Client{Timeout: 5 * time.Second}
```

## Fail example
```go
client := &http.Client{}
```
