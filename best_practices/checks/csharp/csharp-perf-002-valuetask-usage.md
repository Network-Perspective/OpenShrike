# CSHARP-PERF-002: Prefer ValueTask for high-frequency async

## Intent
`ValueTask` can reduce allocations in hot async paths when appropriate.

## Step-by-step evaluation
1. Identify hot async APIs that frequently complete synchronously.
2. Consider `ValueTask` instead of `Task`.

## Pass example
```csharp
public ValueTask<int> TryGetAsync(string key)
{
    if (_cache.TryGetValue(key, out var value))
        return new ValueTask<int>(value);
    return new ValueTask<int>(_store.GetAsync(key));
}
```

## Fail example
```csharp
public Task<int> TryGetAsync(string key)
{
    if (_cache.TryGetValue(key, out var value))
        return Task.FromResult(value);
    return _store.GetAsync(key);
}
```
