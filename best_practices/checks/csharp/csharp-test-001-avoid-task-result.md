# CSHARP-TEST-001: Tests do not block on async work

## Intent

Tests should exercise async code asynchronously. Blocking with `.Result`,
`.Wait()`, or `.GetAwaiter().GetResult()` hides deadlocks, distorts failures,
and often tests a different execution path than production.

## Applicability

Applies when test code calls async APIs or awaits asynchronous side effects.

Return `unknown` when no async code is involved.

## Strategy

`static`

## What to inspect

1. Search test projects for `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()`.
2. Check whether the call is on a `Task` produced by the system under test.

## Pass criteria

- Async tests are marked `async` and use `await`.
- Timeout or polling helpers remain cancellation-aware.

## Fail criteria

- Test code blocks on a `Task` from the system under test.
- Test setup or assertions use synchronous waits where `await` is available.

## Do not flag

- Explicit tests that intentionally verify blocking behavior.
- Waiting on external process exit or other APIs that do not expose an async
  alternative.

## Evidence to collect

- The blocking call.
- The async method being forced synchronously.

## Confidence guidance

- `HIGH`: the blocking call is directly visible in test code.
- `MEDIUM`: helper indirection obscures whether the underlying operation is a
  task from the SUT.
- `LOW`: prefer `unknown` if the code fragment is incomplete.

## Remediation

- Make the test method `async`.
- Await the operation directly.
- Replace sleep-based timing with awaitable synchronization.

## Pass example

```csharp
[Fact]
public async Task Calculates_total()
{
    var total = await _sut.CalculateAsync();
    total.Should().Be(42);
}
```

## Fail example

```csharp
[Fact]
public void Calculates_total()
{
    var total = _sut.CalculateAsync().Result;
    total.Should().Be(42);
}
```
