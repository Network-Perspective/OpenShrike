# CSHARP-PERF-003: Hot loops do not hide work behind allocation-heavy LINQ chains

## Intent

LINQ is usually fine. It becomes a problem when used repeatedly in hot loops,
allocating iterators and delegates in code that is known to be
throughput-sensitive.

## Applicability

Applies only when the changed code is in a proven hot path or inside a loop
that runs over large collections on critical paths.

Return `unknown` for ordinary business logic.

## Strategy

`heuristic`

## What to inspect

1. Find LINQ chains inside tight loops or high-volume request paths.
2. Check whether the code repeatedly allocates intermediate sequences.

## Pass criteria

- The hot path uses direct loops or non-allocating APIs where that materially
  matters.

## Fail criteria

- The diff introduces nested or repeated LINQ chains in a clearly hot loop.

## Do not flag

- One-time query composition.
- Readable business logic outside performance-sensitive code.
- LINQ usage with no evidence of hot-path significance.

## Evidence to collect

- The LINQ chain.
- The reason the path is performance-sensitive.

## Confidence guidance

- `HIGH`: repeated LINQ allocations in a clear hot loop are visible.
- `MEDIUM`: the path looks hot, but throughput relevance is inferred.
- `LOW`: prefer `unknown` if the performance claim is weak.

## Remediation

- Replace the inner hot loop with an explicit `for` or `foreach`.
- Keep LINQ in non-critical code where clarity wins.

## Pass example

```csharp
var total = 0;
foreach (var item in items)
{
    if (item.IsActive)
    {
        total += item.Count;
    }
}
```

## Fail example

```csharp
foreach (var batch in batches)
{
    total += batch.Items.Where(x => x.IsActive).Sum(x => x.Count);
}
```
