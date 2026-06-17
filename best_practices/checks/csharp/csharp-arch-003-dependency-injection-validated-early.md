---
id: csharp-arch-003
title: Dependency injection is validated early
domain: arch
language: csharp
app-type: [any]
status: active
sources:
  - type: documentation
    title: Microsoft .NET runtime configuration & IOptions validation docs
    section: IOptionsSnapshot<TOptions>
---

# csharp-arch-003: Dependency injection is validated early

## Intent
Container and lifetime mistakes should fail during startup or automated validation, not at the first production request.

## Applicability
Applies to apps using `Microsoft.Extensions.DependencyInjection`.

## What to inspect
Host-builder validation, `BuildServiceProvider()` misuse, singleton registrations, and lifetime-sensitive constructor dependencies.

## Pass criteria
Startup validation is enabled or equivalent host-building tests exist, and singleton registrations do not pull scoped-only abstractions such as `IOptionsSnapshot<T>`.

## Fail criteria
The diff disables validation, builds secondary root providers in registration code, or wires a singleton to scoped-only DI abstractions.

## Do not flag
Library extension methods and test-only host construction.

## Confidence guidance
`HIGH` when validation is bypassed or the lifetime mismatch is direct. `MEDIUM` when startup wiring is partly inferred. `LOW` when the host path is out of scope.

## Remediation
Enable provider validation, remove secondary roots, and fix lifetime mismatches.

## Pass example
```csharp
builder.Host.UseDefaultServiceProvider(o => { o.ValidateScopes = true; o.ValidateOnBuild = true; });
```

## Fail example
```csharp
builder.Services.AddSingleton<CachePrimer>(); // CachePrimer(IOptionsSnapshot<CacheOptions> options)
```
