---
id: rel-018
title: In-process caches and session state are bounded or recomputable
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Release It!
    author: Michael T. Nygard
---

# rel-018: In-process caches and session state are bounded or recomputable

## Intent
Prevent long-running processes from turning caches or session payloads into hidden memory leaks.

## Applicability
Applies to application caches, in-memory maps, and session payload design.

## What to inspect
Cache eviction, TTLs, session contents, and whether cached or session state can be recomputed.

## Pass criteria
Caches have eviction or expiry and session state stays small enough to reconstruct safely.

## Fail criteria
The diff adds an unbounded cache or stores bulky, hard-to-rebuild state in a session.

## Do not flag
Tiny fixed-size lookup tables and immutable startup data.

## Confidence guidance
`HIGH` when unbounded accumulation is directly visible. `MEDIUM` when bounds may be configured elsewhere. `LOW` when data volume is unclear.

## Remediation
Add TTL or eviction and store only compact recomputable session state.

## Pass example
```python
cache = TTLCache(maxsize=1000, ttl=300)
```

## Fail example
```python
cache = {}
```
