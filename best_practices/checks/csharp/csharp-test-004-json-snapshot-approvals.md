# CSHARP-TEST-004: JSON snapshots use approvals

## Intent
Large JSON outputs should be approved snapshots to ensure intentional changes.

## Step-by-step evaluation
1. Identify tests asserting large JSON outputs.
2. Prefer snapshot/approval frameworks with reviewed baselines.

## Pass example
```csharp
var json = JsonSerializer.Serialize(result);
json.Should().MatchApproved();
```

## Fail example
```csharp
var json = JsonSerializer.Serialize(result);
json.Should().Contain("\"status\":\"ok\"");
```
