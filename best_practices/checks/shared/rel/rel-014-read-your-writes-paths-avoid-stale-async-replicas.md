---
id: rel-014
title: Read-your-writes paths avoid stale async replicas
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Data-Intensive Applications
    author: Martin Kleppmann
---

# rel-014: Read-your-writes paths avoid stale async replicas

## Intent
Prevent user-visible contradictions immediately after a successful write.

## Applicability
Applies when the diff routes post-write reads through replicas or asynchronously replicated stores.

## What to inspect
Read routing after writes, follower reads, consistency flags, and session stickiness for read-your-writes paths.

## Pass criteria
Paths that require read-your-writes consistency read from a primary, a session-consistent replica, or another explicitly consistent source.

## Fail criteria
The diff routes a read-your-writes path to an asynchronous replica with no consistency guard.

## Do not flag
Analytics and background reads that do not require immediate consistency.

## Confidence guidance
`HIGH` when write then replica-read behavior is directly visible. `MEDIUM` when routing helpers partly hide store choice. `LOW` when read consistency requirements are unclear.

## Remediation
Route those reads to a consistent source or carry session-consistency state through the path.

## Pass example
```go
user := primaryDB.GetUser(id)
```

## Fail example
```go
user := replicaDB.GetUser(id)
```
