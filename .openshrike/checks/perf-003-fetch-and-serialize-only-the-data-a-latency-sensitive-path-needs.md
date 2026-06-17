---
id: perf-003
title: Fetch and serialize only the data a latency-sensitive path needs
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Performance Excuses Debunked
    author: Casey Muratori
  - type: article
    title: Vlad Mihalcea's blog + EF Core performance docs
---

# perf-003: Fetch and serialize only the data a latency-sensitive path needs

## Intent
Prevent endpoints and render paths from paying avoidable CPU, memory, network, and payload costs for unused data.

## Applicability
Applies when the diff adds or changes database projections, ORM queries, API response shaping, template rendering, or serialization for user-facing or clearly high-volume paths. Return `unknown` if the path is an export, backup, admin diagnostic, or another workflow where full-record retrieval is the explicit purpose.

## What to inspect
`SELECT *` queries, ORM entity loads followed by sparse field usage, broad JSON serialization, response DTOs, templates, and code that shows which fields are actually read or returned.

## Pass criteria
Direct evidence shows the code projects only the needed columns or fields, constructs a narrow DTO, or otherwise limits fetched and serialized data to what the path consumes.

## Fail criteria
The diff fetches or serializes full records or large object graphs on a latency-sensitive path even though the surrounding code only uses a small subset of fields, and no repository evidence shows the full payload is intentionally required.

## Do not flag
Do not flag exports, archival jobs, debugging endpoints, or create or update flows that legitimately need the full record. Do not flag generated code or framework internals where projection is not controlled by the application.

## Confidence guidance
`HIGH` when the diff fetches a full entity or `SELECT *` and the same code uses only a few fields. `MEDIUM` when sparse usage is split across helpers but the mismatch is still visible. `LOW` when the real downstream consumers of the full payload are not visible in the repo.

## Remediation
Project only the columns or fields the path actually needs before rendering or serializing the response.

## Pass example
```sql
SELECT id, display_name, avatar_url
FROM users
WHERE id = ?;
```

## Fail example
```sql
SELECT *
FROM users
WHERE id = ?;
```
