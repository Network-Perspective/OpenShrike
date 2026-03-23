# CSHARP-API-003: Collection endpoints bound response size

## Intent

Collection endpoints should not accidentally return an unbounded amount of data.
Pagination, cursors, or explicit limits protect latency, memory use, and
database load.

## Applicability

Applies to HTTP endpoints that return lists or queryable collections whose size
can grow beyond a small fixed set.

Return `unknown` when the underlying dataset size is not visible.

## Strategy

`heuristic`

## What to inspect

1. Review endpoints returning collections.
2. Check whether the result set is bounded through paging, cursoring, or an
   explicit capped limit.

## Pass criteria

- The endpoint requires or applies an explicit limit with a safe maximum.
- The response contract makes paging or cursor behavior visible.

## Fail criteria

- The endpoint returns an entire table, queryable, or arbitrarily large list.
- Client-supplied page size is accepted with no upper bound.

## Do not flag

- Small fixed reference datasets.
- Admin/export endpoints that are clearly designed for bulk extraction and are
  explicitly gated.

## Evidence to collect

- The collection endpoint.
- The missing bound or missing max page size.

## Confidence guidance

- `HIGH`: an unbounded collection endpoint is directly visible.
- `MEDIUM`: the dataset may be small, but growth potential is inferred.
- `LOW`: prefer `unknown` if the endpoint is clearly fixed-size.

## Remediation

- Add pagination or cursoring.
- Enforce a maximum page size.

## Pass example

```csharp
app.MapGet("/orders", async (int page = 1, int pageSize = 100, CancellationToken ct = default) =>
{
    pageSize = Math.Min(pageSize, 100);
    return await repository.ListAsync(page, pageSize, ct);
});
```

## Fail example

```csharp
app.MapGet("/orders", async (AppDbContext db) =>
    await db.Orders.OrderBy(x => x.CreatedAt).ToListAsync());
```
