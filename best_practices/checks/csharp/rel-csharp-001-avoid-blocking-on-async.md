---
id: rel-csharp-001
title: Async request and service code does not block on tasks or fake async
domain: rel
language: csharp
app-type: [http-service]
status: active
sources:
  - type: article
    title: ASP.NET Core Diagnostic Scenarios
    author: David Fowler
  - type: book
    title: Concurrency in C# Cookbook
    author: Stephen Cleary
  - type: article
    title: Don't Block on Async Code
    author: Stephen Cleary
---

# rel-csharp-001: Async request and service code does not block on tasks or fake async

## Intent
Prevent request-path thread starvation and deadlocks caused by blocking on async work or wrapping naturally async I/O in `Task.Run`.

## Applicability
Applies to ASP.NET Core handlers, middleware, and service code that performs async I/O.

## What to inspect
`.Result`, `.Wait()`, `GetAwaiter().GetResult()`, `Task.Run` around async I/O, synchronous form access, and legacy sync HTTP clients.

## Pass criteria
Async work stays async end-to-end and request-path I/O uses naturally async APIs.

## Fail criteria
The diff blocks on tasks, uses hidden sync-over-async APIs, or wraps async I/O in `Task.Run`.

## Do not flag
Explicit CPU offload that is actually CPU-bound.

## Confidence guidance
`HIGH` when sync-over-async is directly visible. `MEDIUM` when hidden blocking sits in a helper. `LOW` when runtime role is unclear.

## Remediation
Await async APIs directly and keep blocking work off request threads.

## Pass example
```csharp
var form = await Request.ReadFormAsync(ct);
```

## Fail example
```csharp
var form = Request.Form;
```
