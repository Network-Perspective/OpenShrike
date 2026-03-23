# CSHARP-OPS-001: Services expose meaningful health signals

## Intent

Operational health should reflect whether the service can do its job, not just
whether the process is alive. Health checks are especially important when a
service depends on external systems.

## Applicability

Applies to deployable services, APIs, and workers that depend on external
resources such as databases, queues, caches, or critical upstream services.

Return `unknown` for libraries and for apps whose runtime topology is not
visible.

## Strategy

`heuristic`

## What to inspect

1. Find service startup and health-check registration.
2. Identify critical runtime dependencies used by the service.
3. Check whether readiness/liveness signals cover those dependencies where
   appropriate.

## Pass criteria

- The service exposes health endpoints or equivalent health signals.
- Critical dependencies are included in readiness checks when they determine
  whether the service can serve traffic.

## Fail criteria

- The service clearly depends on a database, broker, or cache but exposes no
  meaningful health signal.
- A health check endpoint exists but checks only the process while ignoring
  obvious critical dependencies.

## Do not flag

- Libraries.
- Tiny internal tools not deployed as long-lived services.
- Dependencies that are intentionally optional and degrade gracefully.

## Evidence to collect

- The dependency registration and usage.
- The health-check configuration, or lack of it.

## Confidence guidance

- `HIGH`: critical dependencies are visible and health signaling is clearly
  absent or incomplete.
- `MEDIUM`: the runtime criticality of a dependency is inferred.
- `LOW`: prefer `unknown` if deployment behavior is unclear.

## Remediation

- Add readiness checks for critical dependencies.
- Distinguish liveness from readiness where the platform supports it.

## Pass example

```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(builder.Configuration.GetConnectionString("MainDb")!)
    .AddRedis(builder.Configuration.GetConnectionString("Cache")!);
```

## Fail example

```csharp
builder.Services.AddHealthChecks();
```

The service uses SQL Server and Redis in the request path but the health setup
does not reflect either dependency.
