---
id: csharp-rel-001
title: Cancellation flows through async and long-running work
domain: rel
language: csharp
app-type: [any]
status: active
sources:
  - type: article
    title: ASP.NET Core Diagnostic Scenarios
    author: David Fowler
  - type: article
    title: Cancellation blog series
    author: Stephen Cleary
---

# csharp-rel-001: Cancellation flows through async and long-running work

## Intent
Cancellation tokens are part of correctness in .NET request, I/O, and background code.

## Applicability
Applies to async methods, request handlers, loops, and operations that may outlive the initiating caller.

## What to inspect
Boundary signatures, downstream async calls, linked tokens, CPU loops, and cancellation exception handling.

## Pass criteria
Relevant boundaries accept a `CancellationToken`, forward it downstream, and report honored cancellation correctly.

## Fail criteria
The diff drops a visible token, substitutes `CancellationToken.None`, misuses `Task.Run` token semantics, or keeps long-running work running after cancellation.

## Do not flag
Tiny synchronous helpers and externally constrained signatures that still honor available downstream cancellation.

## Confidence guidance
`HIGH` when the dropped token or ignored cancellation is directly visible. `MEDIUM` when the full call chain is partly outside scope. `LOW` when cancellation relevance is unclear.

## Remediation
Accept and propagate `CancellationToken`, link child timeouts to parent tokens, and stop loops promptly on cancellation.

## Pass example
```csharp
await _client.SendAsync(request, ct);
```

## Fail example
```csharp
await _client.SendAsync(request, CancellationToken.None);
```
