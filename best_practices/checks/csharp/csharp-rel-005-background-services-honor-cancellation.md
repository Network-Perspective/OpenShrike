# CSHARP-REL-005: Background services stop cleanly and do not spin on failure

## Intent

Background workers should cooperate with shutdown and fail in a controlled
way. Infinite loops, swallowed exceptions, and uncancelable delays are common
sources of stuck deployments and hidden production incidents.

## Applicability

Applies to `BackgroundService`, `IHostedService`, queue consumers, timers, and
other long-running service loops.

Return `unknown` when no long-running worker code is in scope.

## Strategy

`heuristic`

## What to inspect

1. Find long-running loops and worker implementations.
2. Check whether loops honor `stoppingToken`.
3. Check exception handling and retry/backoff behavior.

## Pass criteria

- Loops exit when cancellation is requested.
- Delays and waits take the stopping token.
- Exceptions are surfaced, bounded, or handled with deliberate backoff.

## Fail criteria

- `while (true)` loops ignore shutdown.
- `Task.Delay(...)` in workers omits the stopping token.
- Broad `catch` blocks keep looping immediately after failures.
- Fire-and-forget tasks hide worker failures.

## Do not flag

- One-shot startup tasks.
- External schedulers that do not own their own loop.
- Clearly bounded retry loops with backoff and cancellation.

## Evidence to collect

- The worker loop.
- The missing cancellation or unsafe error-handling behavior.

## Confidence guidance

- `HIGH`: uncancelable loop or tight failure spin is directly visible.
- `MEDIUM`: worker lifecycle is partly inferred from framework code.
- `LOW`: prefer `unknown` if the loop ownership is unclear.

## Remediation

- Accept and pass `stoppingToken`.
- Use cancellation-aware delays.
- Add bounded backoff and surface unrecoverable failures.

## Pass example

```csharp
while (!stoppingToken.IsCancellationRequested)
{
    await _processor.RunOnceAsync(stoppingToken);
    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
}
```

## Fail example

```csharp
while (true)
{
    try
    {
        await _processor.RunOnceAsync(CancellationToken.None);
    }
    catch
    {
    }

    await Task.Delay(TimeSpan.FromSeconds(1));
}
```
