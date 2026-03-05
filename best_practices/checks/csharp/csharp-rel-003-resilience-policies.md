# CSHARP-REL-003: Resilience policies for outbound calls

## Intent
Outbound calls should be protected by retry/circuit-breaker policies.

## Step-by-step evaluation
1. Identify external HTTP or message bus calls.
2. Ensure policies exist (retry, timeout, circuit breaker).

## Pass example
```csharp
builder.Services.AddHttpClient("payments")
    .AddTransientHttpErrorPolicy(p => p.CircuitBreakerAsync(5, TimeSpan.FromMinutes(1)))
    .AddTransientHttpErrorPolicy(p => p.WaitAndRetryAsync(3, _ => TimeSpan.FromSeconds(2)));
```

## Fail example
```csharp
builder.Services.AddHttpClient("payments"); // no policies
```
