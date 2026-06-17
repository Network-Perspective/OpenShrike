---
id: csharp-arch-005
title: Application code does not use the service locator pattern
domain: arch
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-arch-005: Application code does not use the service locator pattern

## Intent
Dependencies should remain visible in constructors or narrow factories instead of being pulled from `IServiceProvider` inside business logic.

## Applicability
Applies to DI-based .NET applications and services.

## What to inspect
`IServiceProvider`, `GetRequiredService`, `GetService`, and where those calls occur.

## Pass criteria
Runtime code receives dependencies explicitly and any service resolution stays in composition or tightly scoped infrastructure.

## Fail criteria
Application services, handlers, or domain code resolve collaborators ad hoc from `IServiceProvider`.

## Do not flag
Framework extension points and scoped infrastructure code that must create a scope for one unit of work.

## Confidence guidance
`HIGH` when runtime service-location is direct. `MEDIUM` when the boundary is fuzzy. `LOW` when only bootstrap fragments are visible.

## Remediation
Inject the dependency directly or introduce a narrow factory.

## Pass example
```csharp
public InvoiceHandler(IInvoiceRepository repo, IClock clock) { }
```

## Fail example
```csharp
var repo = _services.GetRequiredService<IInvoiceRepository>();
```
