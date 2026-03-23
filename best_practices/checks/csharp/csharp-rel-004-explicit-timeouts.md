# CSHARP-REL-004: Remote and waiting operations have explicit time budgets

## Intent

Every remote call and long wait should have a bounded time budget. Without one,
the system accumulates stuck requests, thread starvation, and unpredictable
tail latency.

## Applicability

Applies when the diff introduces remote I/O, polling, queues, storage calls, or
artificial waits in production code.

Return `unknown` when the caller's bounded cancellation flow is clearly present
but the actual timeout source is outside scope.

## Strategy

`heuristic`

## What to inspect

1. Find outbound calls, `Task.Delay`, wait loops, and long-running async
   operations.
2. Check whether they use a caller token, timeout policy, or explicit deadline.

## Pass criteria

- The operation is bounded by a passed `CancellationToken`, timeout policy, or
  explicit deadline.
- Waiting helpers use cancellation-aware delays.

## Fail criteria

- A remote call is issued with no visible timeout or cancellation path.
- `Task.Delay` or wait loops run without cancellation in production code.
- Infinite or default-long client timeouts are relied on accidentally.

## Do not flag

- Immediate in-memory work.
- Calls already clearly bounded by an incoming request token.
- Integration tests.

## Evidence to collect

- The remote call or wait site.
- The missing timeout or missing token flow.

## Confidence guidance

- `HIGH`: no timeout or cancellation is directly visible on a remote/waiting
  path.
- `MEDIUM`: timeout handling may exist elsewhere, but is not visible in scope.
- `LOW`: prefer `unknown` when the underlying client wrapper is hidden.

## Remediation

- Pass a caller token through the call chain.
- Add a timeout policy or explicit deadline.
- Make waits cancellation-aware.

## Pass example

```csharp
using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
cts.CancelAfter(TimeSpan.FromSeconds(5));
return await _client.SendAsync(request, cts.Token);
```

## Fail example

```csharp
await Task.Delay(TimeSpan.FromMinutes(5));
return await _client.SendAsync(request);
```
