# CSHARP-REL-001: Thread CancellationToken through async calls

## Intent
Cancellation should propagate through async call chains to avoid runaway work.

## Step-by-step evaluation
1. Identify async public methods.
2. Ensure they accept and pass `CancellationToken` to dependencies.

## Pass example
```csharp
public Task<User> GetAsync(Guid id, CancellationToken ct) =>
    _repo.GetAsync(id, ct);
```

## Fail example
```csharp
public Task<User> GetAsync(Guid id, CancellationToken ct) =>
    _repo.GetAsync(id, CancellationToken.None);
```
