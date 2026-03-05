# CSHARP-OPS-001: Health checks registered for dependencies

## Intent
Health checks provide readiness/liveness for critical dependencies.

## Step-by-step evaluation
1. Find health check configuration.
2. Ensure external dependencies are included.

## Pass example
```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(builder.Configuration.GetConnectionString("db"));
```

## Fail example
```csharp
builder.Services.AddHealthChecks(); // no dependency checks
```
