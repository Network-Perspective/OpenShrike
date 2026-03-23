# CSHARP-PERF-002: ValueTask is used only where it meaningfully reduces overhead

## Intent

`ValueTask` is a specialized optimization tool. It is useful when an async API
frequently completes synchronously on a hot path. It is not a general upgrade
over `Task`.

## Applicability

Applies only to performance-sensitive async APIs that commonly complete
synchronously.

Return `unknown` when the code is ordinary application logic with no clear
allocation pressure.

## Strategy

`heuristic`

## What to inspect

1. Find async APIs returning `Task` or `ValueTask`.
2. Check whether the operation often completes synchronously.
3. Look for evidence that the path is allocation-sensitive.

## Pass criteria

- `ValueTask` is used for a hot path with frequent synchronous completion, or
- `Task` is kept because the path is not hot enough to justify complexity.

## Fail criteria

- A clearly hot API repeatedly returns `Task.FromResult(...)` with evidence that
  synchronous completion dominates and allocations matter.
- `ValueTask` is introduced gratuitously where no such evidence exists.

## Do not flag

- Typical request-handling code.
- Public APIs where `Task` simplicity is the better tradeoff.
- Async methods that almost always perform real asynchronous I/O.

## Evidence to collect

- The API and completion pattern.
- The reason the path is performance-sensitive.

## Confidence guidance

- `HIGH`: the hot path and frequent synchronous completion are directly visible.
- `MEDIUM`: one of those factors is inferred.
- `LOW`: prefer `unknown` if this is just speculative optimization advice.

## Remediation

- Use `ValueTask` only for proven synchronous-heavy hot paths.
- Prefer `Task` elsewhere.

## Pass example

```csharp
public ValueTask<int> TryGetAsync(string key)
{
    if (_cache.TryGetValue(key, out var value))
    {
        return new ValueTask<int>(value);
    }

    return new ValueTask<int>(_store.GetAsync(key));
}
```

## Fail example

```csharp
public Task<int> TryGetAsync(string key)
{
    if (_cache.TryGetValue(key, out var value))
    {
        return Task.FromResult(value);
    }

    return _store.GetAsync(key);
}
```

In a proven hot cache path, this may justify `ValueTask`; outside that context,
it should be `unknown`, not `fail`.
