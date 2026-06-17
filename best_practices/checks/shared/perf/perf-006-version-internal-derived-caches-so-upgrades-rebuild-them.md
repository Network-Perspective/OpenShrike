---
id: perf-006
title: Version internal derived caches so upgrades rebuild them
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Reflections on software performance
    author: Nelson Elhage
---

# perf-006: Version internal derived caches so upgrades rebuild them

## Intent
Prevent internal performance caches from turning into a source of upgrade bugs, migration code, and long-term maintenance complexity.

## Applicability
Applies when the diff adds or changes a persisted cache for derived internal data such as indexes, compiled metadata, analysis results, rendered artifacts, or other data that can be recomputed from repository inputs. Return `unknown` if the stored data is user-authored, part of a public wire format, shared with external systems, or otherwise must remain compatible across versions for product reasons visible in the repo.

## What to inspect
Cache key construction, cache file naming, schema or version markers, invalidation logic, migration code, comments about external consumers, and release or upgrade docs for the cached artifact.

## Pass criteria
Direct evidence shows the cache is namespaced or invalidated by version, commit, schema hash, or another explicit producer version marker, or the repository clearly documents why cross-version cache compatibility is required.

## Fail criteria
The diff adds or changes a persisted derived-data cache that is reused across upgrades without any explicit version or schema marker, or adds compatibility or migration logic for such a cache even though the repository shows no external requirement to preserve old cache data.

## Do not flag
Do not flag databases, user data, resumable job state, public artifact formats, or caches that multiple deployed versions are documented to share. Do not flag purely in-memory caches that disappear on process restart.

## Confidence guidance
`HIGH` when the diff shows a new persisted cache key or file format with no version marker, or visible migration code for an internal derived cache. `MEDIUM` when the cache is clearly derived and persisted, but versioning may happen indirectly elsewhere. `LOW` when whether external compatibility is required is only weakly implied.

## Remediation
Add an explicit version or schema marker to the cache and rebuild it on mismatch instead of preserving cross-version compatibility by default.

## Pass example
```go
cacheKey := fmt.Sprintf("%s:%s", buildCommit, sourceHash)
path := filepath.Join(cacheDir, cacheKey+".json")
```

## Fail example
```go
cacheKey := sourceHash
path := filepath.Join(cacheDir, cacheKey+".json")
```
