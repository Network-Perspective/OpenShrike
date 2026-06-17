---
id: perf-csharp-003
title: Avoid eager-loading multiple collection navigations in one query
domain: perf
language: csharp
app-type: [any]
status: active
sources:
  - type: article
    title: Vlad Mihalcea's blog + EF Core performance docs
---

# perf-csharp-003: Avoid eager-loading multiple collection navigations in one query

## Intent
Loading several collection navigations in one query can multiply rows and transfer large duplicated result sets.

## Applicability
Applies when the diff adds or changes EF Core queries with `Include` chains over collection navigations. Return `unknown` if the query shape or navigation cardinality is not visible enough to tell whether multiple collection includes are involved.

## What to inspect
EF queries using `.Include()` and `.ThenInclude()`, the entity model for whether the included navigations are collections, and any projection that limits the shape of the loaded result.

## Pass criteria
The query loads at most one collection navigation from the root entity, or it projects only the needed related data instead of eagerly loading multiple collections into one result set.

## Fail criteria
The diff adds a single EF query that eagerly loads multiple collection navigations from the same root graph, with no visible projection or other shaping to avoid a large multiplied result.

## Do not flag
Do not flag includes of reference navigations only. Do not flag a single collection include when no second collection is joined into the same query. Do not flag code that already projects to a limited result shape instead of materializing the full graph.

## Confidence guidance
`HIGH` when the diff clearly shows multiple collection `Include` paths on one query. `MEDIUM` when multiple includes are visible, and nearby entity definitions strongly imply they are collections. `LOW` when the include chain is visible, but repository context is too weak to confirm navigation cardinality.

## Remediation
Replace the broad eager load with a projection that fetches only the related data the caller actually needs.

## Pass example
```csharp
var orders = await context.Orders
    .Select(o => new
    {
        o.Id,
        CustomerName = o.Customer.Name,
        ItemCount = o.Items.Count
    })
    .ToListAsync();
```

## Fail example
```csharp
var orders = await context.Orders
    .Include(o => o.Items)
    .Include(o => o.Payments)
    .ToListAsync();
```
