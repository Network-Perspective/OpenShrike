---
id: csharp-rel-005
title: Background services stop cleanly and do not spin on failure
domain: rel
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-rel-005: Background services stop cleanly and do not spin on failure

## Intent
Make long-running .NET workers cooperate with shutdown and avoid tight failure loops.

## Applicability
Applies to `BackgroundService`, `IHostedService`, and long-running worker loops.

## What to inspect
Loop conditions, `Task.Delay`, `stoppingToken`, and error handling.

## Pass criteria
Worker loops honor `stoppingToken`, use cancellation-aware waits, and surface or back off on failure.

## Fail criteria
The diff adds `while (true)` loops, uncancelable delays, or broad catch-and-spin behavior.

## Do not flag
One-shot startup tasks and externally scheduled work with no owned loop.

## Confidence guidance
`HIGH` when the bad loop is directly visible. `MEDIUM` when worker ownership is partly inferred. `LOW` when lifecycle ownership is unclear.

## Remediation
Tie the loop to `stoppingToken`, make waits cancelable, and add bounded backoff.

## Pass example
```csharp
while (!stoppingToken.IsCancellationRequested) await Task.Delay(1000, stoppingToken);
```

## Fail example
```csharp
while (true) await Task.Delay(1000);
```
