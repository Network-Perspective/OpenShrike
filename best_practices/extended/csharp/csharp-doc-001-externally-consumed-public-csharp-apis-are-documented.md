---
id: csharp-doc-001
title: Externally consumed public C# APIs are documented
domain: doc
language: csharp
app-type: [library]
status: active
sources: []
---

# csharp-doc-001: Externally consumed public C# APIs are documented

## Intent
If a repository publishes a reusable library, public APIs should explain behavior that consumers cannot safely infer from signatures alone.

## Applicability
Applies only to externally consumed libraries and SDKs.

Return `unknown` for internal applications and services.

## What to inspect
1. Determine whether the project is an externally consumed library.
2. Review changed public members for missing behavioral documentation.
3. Inspect XML docs or equivalent generated docs for exceptions, nullability, side effects, and usage semantics where those matter to consumers.

## Pass criteria
- New or changed public APIs include meaningful XML docs or equivalent generated documentation for behavior, nullability, side effects, and exceptions where those matter to consumers.

## Fail criteria
- A reusable package adds consumer-facing public API with no meaningful discoverability documentation.

## Do not flag
- Internal services.
- Obvious overrides or interface implementations whose docs are inherited.
- Trivial DTO properties where the type fully explains the meaning.

## Confidence guidance
- `HIGH`: reusable library context and undocumented public API are directly visible.
- `MEDIUM`: library intent is inferred from packaging.
- `LOW`: prefer `unknown` if consumer expectations are unclear.

## Remediation
- Add XML docs or equivalent public documentation focused on consumer behavior.

## Pass example
```csharp
/// <summary>
/// Sends the command exactly once unless the caller retries after a transport failure.
/// </summary>
public Task SendAsync(Command command, CancellationToken ct);
```

## Fail example
```csharp
public Task SendAsync(Command command, CancellationToken ct);
```
