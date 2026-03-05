# CSHARP-PERF-001: Avoid boxing in hot paths

## Intent
Boxing allocations can cause performance issues in tight loops.

## Step-by-step evaluation
1. Identify hot-path loops.
2. Ensure value types are not boxed (use generics/Span).

## Pass example
```csharp
Span<int> values = stackalloc int[10];
for (var i = 0; i < values.Length; i++) values[i] = i;
```

## Fail example
```csharp
object total = 0; // boxing
for (var i = 0; i < 10; i++) total = (int)total + i;
```
