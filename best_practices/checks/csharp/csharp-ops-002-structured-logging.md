# CSHARP-OPS-002: Structured logging with scopes and correlation IDs

## Intent
Structured logs enable tracing and troubleshooting in production.

## Step-by-step evaluation
1. Check logging setup for structured logging (Serilog, MEL structured logs).
2. Ensure correlation IDs are included in log scope.

## Pass example
```csharp
using (_logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = cid }))
{
    _logger.LogInformation("Processing order {OrderId}", orderId);
}
```

## Fail example
```csharp
_logger.LogInformation($"Processing order {orderId}"); // unstructured
```
