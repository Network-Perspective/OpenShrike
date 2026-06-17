---
id: perf-csharp-001
title: Preload related data before iterating over navigation properties
domain: perf
language: csharp
app-type: [any]
status: active
sources:
  - type: article
    title: EF Core performance docs
    author: Vlad Mihalcea
---

# perf-csharp-001: Preload related data before iterating over navigation properties

## Intent
Accessing unloaded navigation properties inside a loop turns one query into many roundtrips and produces latency that scales with result size.

## Applicability
Applies when the diff adds or changes EF Core queries that iterate over entity collections and read related entities or navigation-derived counts inside the loop. Return `unknown` if the surrounding code does not show whether the navigation data was already loaded or projected.

## What to inspect
Queries that materialize entity lists, subsequent loops over those entities, navigation property access inside the loop body, and whether the original query uses `Include`, explicit projection, or another visible preload of the needed related data.

## Pass criteria
The needed related data is loaded in the original query via projection or explicit eager loading, so the loop does not trigger additional per-entity database queries.

## Fail criteria
The diff materializes a set of EF entities and then accesses an unloaded navigation property or related aggregate inside a loop, creating one database fetch per entity.

## Do not flag
Do not flag loops over DTOs or anonymous projections that already contain the needed related values. Do not flag code where the diff clearly shows the navigation was eagerly loaded before the loop. Do not flag test code using in-memory collections rather than a real EF-backed query path.

## Confidence guidance
`HIGH` when the query and the loop are both visible, and the loop reads a navigation property that was not projected or eagerly loaded. `MEDIUM` when the loop clearly reads related data per entity, but the query setup is partly outside the diff. `LOW` when the code suggests a potential N+1 pattern, but repository evidence is too incomplete to show whether lazy loading or prior loading actually occurs.

## Remediation
Load the required related data in the original query with projection or explicit eager loading.

## Pass example
```csharp
var users = await context.Users
    .Select(u => new
    {
        u.Id,
        OrderCount = u.Orders.Count
    })
    .ToListAsync();

foreach (var user in users)
{
    Console.WriteLine(user.OrderCount);
}
```

## Fail example
```csharp
var users = await context.Users.ToListAsync();

foreach (var user in users)
{
    Console.WriteLine(user.Orders.Count);
}
```
