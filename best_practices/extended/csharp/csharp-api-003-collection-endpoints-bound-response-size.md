---
id: csharp-api-003
title: Collection endpoints bound response size
domain: api
language: csharp
app-type: [http-service]
status: active
sources: []
---

# csharp-api-003: Collection endpoints bound response size

## Intent
ASP.NET collection endpoints should not return an unbounded amount of data.

## Applicability
Applies to HTTP endpoints that return lists or queryable collections whose size can grow beyond a small fixed set. Return `unknown` when the underlying dataset size is not visible.

## What to inspect
Changed endpoint handlers, LINQ queries, page-size parameters, and response contracts that advertise paging or cursor behavior.

## Pass criteria
The endpoint applies an explicit limit with a safe maximum and makes paging or cursor behavior visible in the response contract.

## Fail criteria
The endpoint returns an entire table or arbitrarily large list, or accepts a caller-supplied page size with no upper bound.

## Do not flag
Small fixed reference datasets or clearly gated admin or export endpoints designed for bulk extraction.

## Confidence guidance
`HIGH` when an unbounded collection endpoint is directly visible. `MEDIUM` when the dataset may be small today but growth is inferred. `LOW` when the endpoint is clearly fixed-size.

## Remediation
Add pagination or cursoring and enforce a maximum page size.

## Pass example
```csharp
pageSize = Math.Min(pageSize, 100);
return await repo.ListAsync(page, pageSize, ct);
```

## Fail example
```csharp
return await db.Orders.OrderBy(x => x.CreatedAt).ToListAsync(ct);
```
