---
id: data-027
title: Compute derived values from source fields instead of hand-maintaining them
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Refactoring
    author: Martin Fowler
    section: Replace Derived Variable with Query
---

# data-027: Compute derived values from source fields instead of hand-maintaining them

## Intent
Avoid source-of-truth drift caused by manually synchronizing derived values in multiple places.

## Applicability
Applies to computed totals, statuses, counters, and other values derivable from canonical fields. Return `unknown` when persistence constraints require materialization and sync logic is elsewhere.

## What to inspect
Stored totals, duplicated state fields, update logic across multiple call sites, and getter or query alternatives.

## Pass criteria
Derived values are computed from source fields when needed, or materialized through one authoritative derivation path.

## Fail criteria
Application code hand-updates the same derived value from multiple places, risking divergence from the source fields.

## Do not flag
Deliberately materialized fields with one visible authoritative recomputation path and consistency guardrails.

## Confidence guidance
`HIGH` when the same derived field is manually maintained in several paths. `MEDIUM` when a background repair job may exist. `LOW` when only one update site is visible.

## Remediation
Compute from source fields on demand or centralize materialization behind one authoritative update path.

## Pass example
```javascript
get total() { return this.items.reduce((sum, i) => sum + i.price, 0); }
```

## Fail example
```javascript
order.total += item.price;
```
