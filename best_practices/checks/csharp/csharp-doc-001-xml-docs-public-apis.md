# CSHARP-DOC-001: XML docs for public APIs

## Intent
Public APIs should be documented with XML comments for discoverability.

## Step-by-step evaluation
1. Locate public classes/methods.
2. Verify XML comments exist and docs generation is enabled.

## Pass example
```csharp
/// <summary>Gets a user by id.</summary>
public Task<User?> GetByIdAsync(Guid id, CancellationToken ct);
```

## Fail example
```csharp
public Task<User?> GetByIdAsync(Guid id, CancellationToken ct);
```
