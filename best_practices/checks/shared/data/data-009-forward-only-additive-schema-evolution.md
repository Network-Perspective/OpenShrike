---
id: data-009
title: Evolve deployed schemas with forward-only, additive-first compatibility changes
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Evolutionary Architectures
  - type: book
    title: "Refactoring Databases: Evolutionary Database Design"
---

# data-009: Evolve deployed schemas with forward-only, additive-first compatibility changes

## Intent
Let old and new code coexist during deployments and schema transitions without lockstep breakage.

## Applicability
Applies to shared databases, durable schemas, and rolling deployments. Return `unknown` when migration order and consumers are out of scope.

## What to inspect
Migrations, renames, drops, compatibility phases, dual-write or sync mechanisms, and dependent database objects.

## Pass criteria
Schema evolution proceeds through additive or compatibility-preserving steps, keeps old and new representations working during transition, and updates dependent objects in the same rollout.

## Fail criteria
Changes drop, rename, or rewrite actively used schema in one step, edit old migrations in place, or leave parallel schemas unsynchronized during cutover.

## Do not flag
Initial greenfield schema creation with no deployed dependents.

## Confidence guidance
`HIGH` when a live rename or destructive drop is directly visible. `MEDIUM` when rollout ordering is assumed. `LOW` when database consumers are external and unseen.

## Remediation
Make this PR the smallest additive, compatibility-preserving phase of the schema change, keep old and new representations working during transition, and defer cleanup until dependents have moved.

## Pass example
```sql
ALTER TABLE orders ADD COLUMN total_cents bigint;
UPDATE orders SET total_cents = total * 100;
```

## Fail example
```sql
ALTER TABLE orders RENAME COLUMN total TO total_cents;
```
