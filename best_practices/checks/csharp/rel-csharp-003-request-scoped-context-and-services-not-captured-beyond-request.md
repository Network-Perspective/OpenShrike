---
id: rel-csharp-003
title: Request-scoped context and services are not captured beyond the request
domain: rel
language: csharp
app-type: [http-service]
status: active
sources:
  - type: article
    title: ASP.NET Core Diagnostic Scenarios
    author: David Fowler
---

# rel-csharp-003: Request-scoped context and services are not captured beyond the request

## Intent
Prevent stale `HttpContext` and disposed scoped-service access after a request ends.

## Applicability
Applies to background work, queued work, object fields, and fire-and-forget tasks started from request code.

## What to inspect
Stored `HttpContext`, stored scoped services, and background tasks using request-scoped objects.

## Pass criteria
Background work copies only durable values and creates its own scope when it needs scoped services.

## Fail criteria
The diff captures `HttpContext` or scoped services for use after the request lifetime.

## Do not flag
Ordinary in-request synchronous use.

## Confidence guidance
`HIGH` when a captured request-scoped object is directly visible. `MEDIUM` when lifetime is inferred from registrations. `LOW` when ownership is incomplete.

## Remediation
Copy primitive request data and resolve scoped services inside a new owned scope for background work.

## Pass example
```csharp
var userId = HttpContext.User.FindFirst("sub")!.Value;
_ = queue.EnqueueAsync(userId);
```

## Fail example
```csharp
_background = Task.Run(() => _db.Users.Add(new UserAudit(HttpContext.User.Identity!.Name!)));
```
