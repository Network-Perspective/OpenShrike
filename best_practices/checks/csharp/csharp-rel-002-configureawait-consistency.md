# CSHARP-REL-002: ConfigureAwait usage is consistent

## Intent
Libraries should avoid capturing context; apps can omit ConfigureAwait for
readability. Consistency reduces deadlocks.

## Step-by-step evaluation
1. Determine if the project is a library or app.
2. Ensure ConfigureAwait usage follows that choice consistently.

## Pass example
```csharp
// Library code
await _client.SendAsync(req, ct).ConfigureAwait(false);
```

## Fail example
```csharp
await _client.SendAsync(req, ct); // mixed usage in library
```
