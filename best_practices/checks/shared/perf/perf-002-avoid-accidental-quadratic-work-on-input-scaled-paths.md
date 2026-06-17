---
id: perf-002
title: Avoid accidental quadratic work on input-scaled paths
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Performance Excuses Debunked
    author: Casey Muratori
---

# perf-002: Avoid accidental quadratic work on input-scaled paths

## Intent
Prevent request and batch paths from slowing superlinearly as input sizes grow.

## Applicability
Applies when the diff changes collection-processing logic in a path that is evidently request-serving, rendering, synchronization, import, compilation, or another input-scaled workload. Return `unknown` if the collections are clearly fixed-size and tiny, or if the repository gives no evidence that the path runs on meaningful input sizes.

## What to inspect
Nested loops, repeated linear membership tests, repeated filtering of the same list, join or dedup logic over collections, and surrounding code or tests that reveal expected input growth.

## Pass criteria
Direct evidence shows the code uses an indexed structure such as a set or map, a single-pass aggregation, sorting plus one merge pass, or another approach that avoids repeated full scans as input grows.

## Fail criteria
The diff introduces nested iteration or repeated linear searches over growing collections in a latency-sensitive or batch path, such that total work scales quadratically or worse with input size.

## Do not flag
Do not flag loops over tiny fixed enumerations, test fixtures, or code whose purpose is exhaustive comparison over a deliberately small bounded set. Do not flag cases where the repository clearly constrains collection size to a small constant.

## Confidence guidance
`HIGH` when the diff visibly performs nested scans or `contains`-style linear membership checks inside a loop on an input-scaled path. `MEDIUM` when a helper hides some of the repeated scanning, but the algorithmic shape is still apparent. `LOW` when applicability depends on runtime collection sizes not visible in the repo.

## Remediation
Replace repeated scans with an indexed structure or a single-pass algorithm that scales linearly or near-linearly.

## Pass example
```javascript
const blockedIds = new Set(blockedUsers.map((user) => user.id));
const visiblePosts = posts.filter((post) => !blockedIds.has(post.authorId));
```

## Fail example
```javascript
const visiblePosts = posts.filter(
  (post) => !blockedUsers.some((user) => user.id === post.authorId)
);
```
