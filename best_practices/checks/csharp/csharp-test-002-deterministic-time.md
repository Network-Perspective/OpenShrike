---
id: csharp-test-002
title: Time-dependent C# tests are deterministic
domain: test
language: csharp
app-type: [any]
status: active
sources: []
---

# csharp-test-002: Time-dependent C# tests are deterministic

## Intent
Tests should not depend on wall-clock timing, race-prone sleeps, or current time sampled from the real system clock. Deterministic tests are faster, clearer, and much less flaky.

## Applicability
Applies when C# tests verify expiration, scheduling, retry, delay, TTL, token validity, or other time-sensitive behavior. Return `unknown` when the changed tests are not time-sensitive.

## What to inspect
Search for `DateTime.Now`, `DateTime.UtcNow`, `DateTimeOffset.UtcNow`, `Thread.Sleep`, `Task.Delay`, and stopwatch-based assertions in test code.

## Pass criteria
Tests control time through a fake clock, `TimeProvider`, or deterministic scheduler, and polling helpers are bounded and tied to a clear condition.

## Fail criteria
A test uses the real clock to decide correctness, waits with `Thread.Sleep` or arbitrary `Task.Delay`, or relies on elapsed real time instead of controlled progression.

## Do not flag
Small bounded waits in clearly integration-heavy suites when no deterministic hook exists, or production code already using `TimeProvider` abstractions correctly.

## Confidence guidance
`HIGH` when real time or sleep-based coordination is directly visible. `MEDIUM` when the test appears time-sensitive but some control flow is hidden. `LOW` when the timing dependency is speculative.

## Remediation
Inject a clock or `TimeProvider`, advance time deterministically, and replace sleep-based coordination with awaitable signals.

## Pass example
```csharp
var clock = new FakeTimeProvider(DateTimeOffset.Parse("2026-03-01T00:00:00Z"));
var sut = new TokenCache(clock);
clock.Advance(TimeSpan.FromMinutes(31));
Assert.True(sut.IsExpired);
```

## Fail example
```csharp
var sut = new TokenCache();
await Task.Delay(TimeSpan.FromMinutes(31));
Assert.True(sut.IsExpired);
```
