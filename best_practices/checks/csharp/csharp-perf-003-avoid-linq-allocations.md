# CSHARP-PERF-003: Avoid excessive LINQ allocations in hot loops

## Intent
Heavy LINQ in tight loops allocates and can degrade performance.

## Step-by-step evaluation
1. Identify hot-path loops using LINQ.
2. Prefer explicit loops for performance-critical code.

## Pass example
```csharp
var total = 0;
foreach (var item in items)
{
    if (item.IsActive) total += item.Count;
}
```

## Fail example
```csharp
var total = items.Where(x => x.IsActive).Sum(x => x.Count);
```
