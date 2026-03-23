# CSHARP-OPS-005: Schema migrations are not applied unsafely on normal startup

## Intent

Applying migrations automatically on every application startup is risky in
multi-instance production systems. Schema change should be coordinated and
observable.

## Applicability

Applies when the repository uses EF Core migrations or another migration system
from application startup code.

Return `unknown` when migration ownership is not visible in scope.

## Strategy

`heuristic`

## What to inspect

1. Search for `Database.Migrate()`, migration runners, or startup migration
   helpers.
2. Determine whether migration execution happens in the normal service startup
   path or in a dedicated admin/deployment path.

## Pass criteria

- Migrations run in a dedicated deployment job, admin command, or guarded
  bootstrap path.
- If startup migration exists, it is clearly restricted to safe environments or
  coordinated single-instance execution.

## Fail criteria

- The normal production startup path applies migrations automatically with no
  guard or coordination.
- Multiple instances could race to change schema during rollout.

## Do not flag

- Test fixtures.
- Local development bootstrap code.
- Dedicated migration executables or release jobs.

## Evidence to collect

- The startup code invoking migrations.
- Missing guards or coordination.

## Confidence guidance

- `HIGH`: production startup directly calls migrations.
- `MEDIUM`: migration code exists, but environment guards may live elsewhere.
- `LOW`: prefer `unknown` if startup topology is unclear.

## Remediation

- Move migrations to a deployment job or explicit admin command.
- Guard any startup migration path to safe environments only.

## Pass example

```csharp
if (app.Environment.IsDevelopment())
{
    await dbContext.Database.MigrateAsync();
}
```

## Fail example

```csharp
await using var scope = app.Services.CreateAsyncScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
await db.Database.MigrateAsync();
```
