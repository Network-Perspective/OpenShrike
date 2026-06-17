---
id: api-go-003
title: Go HTTP handlers stop after writing a terminal error response
domain: api
language: go
app-type: [http-service]
status: active
sources:
  - type: book
    title: 100 Go Mistakes and How to Avoid Them
---

# api-go-003: Go HTTP handlers stop after writing a terminal error response

## Intent
A handler that continues after `http.Error` can write conflicting output or perform side effects after the request has already failed.

## Applicability
Applies when the diff changes Go `net/http` handlers or wrappers that write terminal error responses.

## What to inspect
Calls to `http.Error`, other terminal response writers, early returns, and any work performed after the error path.

## Pass criteria
The handler returns immediately after writing a terminal error response.

## Fail criteria
The handler writes an error and then continues executing business logic or attempts to write another response body or status.

## Do not flag
Non-terminal logging or metric helpers that do not write the response, or helper functions that clearly return control to the caller before more work happens.

## Confidence guidance
`HIGH` when `http.Error` is followed by more handler work. `MEDIUM` when a helper may already return. `LOW` when the response-writing path is indirect.

## Remediation
Return immediately after a terminal error response.

## Pass example
```go
if err != nil {
    http.Error(w, "bad request", http.StatusBadRequest)
    return
}
```

## Fail example
```go
if err != nil {
    http.Error(w, "bad request", http.StatusBadRequest)
}
processRequest()
```
