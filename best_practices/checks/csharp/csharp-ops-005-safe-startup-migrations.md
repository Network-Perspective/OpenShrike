---
id: csharp-ops-005
title: Schema migrations are not applied unsafely on normal startup
domain: ops
language: csharp
app-type: [any]
status: active
sources:
  - type: check
    title: Safe startup migrations
---

# csharp-ops-005: Schema migrations are not applied unsafely on normal startup

## Intent

Applying migrations automatically on every application startup is risky in multi-instance production systems. Schema change should be coordinated and observable.

## Applicability

Applies when the repository uses EF Core migrations or another migration system from application startup code.

## What to inspect

`Database.Migrate()`, startup migration helpers, environment guards, and whether migrations run in the normal service startup path.

## Pass criteria

Migrations run in a dedicated deployment job, admin command, or clearly guarded safe bootstrap path.

## Fail criteria

The normal production startup path applies migrations automatically with no guard or coordination.

## Do not flag

Test fixtures, local development bootstrap code, or dedicated migration executables.

## Confidence guidance

`HIGH` when production startup directly calls migrations. `MEDIUM` when guards may exist elsewhere. `LOW` when startup topology is unclear.

## Remediation

Move migrations to a deployment job or explicit admin command, or guard any startup migration path to safe environments only.

## Pass example

```csharp
if (app.Environment.IsDevelopment())
{
    await dbContext.Database.MigrateAsync();
}
```

## Fail example

```csharp
await db.Database.MigrateAsync();
```
