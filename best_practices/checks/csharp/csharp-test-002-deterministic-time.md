# CSHARP-TEST-002: Time-dependent tests are deterministic

## Intent

Tests should not depend on wall-clock timing, race-prone sleeps, or "current
time" sampled from the real system clock. Deterministic tests are faster,
clearer, and much less flaky.

## Applicability

Applies when tests verify expiration, scheduling, retry, delay, TTL, token
validity, or any other time-sensitive behavior.

Return `unknown` when the changed tests are not time-sensitive.

## Strategy

`static`

## What to inspect

1. Search test code for `DateTime.Now`, `DateTime.UtcNow`, `DateTimeOffset.UtcNow`,
   `Thread.Sleep`, `Task.Delay` without clear synchronization, and stopwatch
   assertions.
2. Check whether the system under test accepts a fake clock or deterministic
   timer abstraction.

## Pass criteria

- Tests control time through a fake clock, time provider, or deterministic
  scheduler.
- Polling helpers are bounded and tied to a clear external condition.

## Fail criteria

- A test uses the real clock to decide correctness.
- A test waits with `Thread.Sleep` or arbitrary delay to "let async work finish".
- A time-sensitive assertion depends on elapsed real time rather than controlled
  progression.

## Do not flag

- Small bounded waits in end-to-end or browser tests when the suite is clearly
  integration-heavy and no deterministic hook exists.
- Production code using `TimeProvider` or equivalent abstractions.

## Evidence to collect

- The nondeterministic clock or sleep usage.
- The time-sensitive assertion or behavior under test.

## Confidence guidance

- `HIGH`: real time or sleep-based coordination is directly visible.
- `MEDIUM`: the test appears time-sensitive, but control flow is partly hidden.
- `LOW`: prefer `unknown` if the timing dependency is speculative.

## Remediation

- Inject a clock or `TimeProvider`.
- Advance time deterministically in tests.
- Replace sleep-based coordination with awaitable signals.

## Pass example

```csharp
[Fact]
public void Expires_after_ttl()
{
    var clock = new FakeClock(new DateTimeOffset(2026, 03, 01, 0, 0, 0, TimeSpan.Zero));
    var sut = new TokenCache(clock);

    clock.Advance(TimeSpan.FromMinutes(31));

    sut.IsExpired.Should().BeTrue();
}
```

## Fail example

```csharp
[Fact]
public async Task Expires_after_ttl()
{
    var sut = new TokenCache();
    await Task.Delay(TimeSpan.FromMinutes(31));
    sut.IsExpired.Should().BeTrue();
}
```
