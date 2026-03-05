# CSHARP-TEST-002: Deterministic time in tests

## Intent
Tests should not depend on wall-clock time.

## Step-by-step evaluation
1. Search for `DateTime.Now`, `DateTime.UtcNow`, or `Stopwatch` in tests.
2. Ensure time is injected or faked.

## Pass example
```csharp
public interface IClock { DateTime UtcNow { get; } }

[Fact]
public void Uses_Fake_Clock()
{
    var clock = new FakeClock(new DateTime(2024, 01, 01));
    var sut = new ReportBuilder(clock);
}
```

## Fail example
```csharp
[Fact]
public void Uses_System_Time()
{
    var sut = new ReportBuilder(new SystemClock());
    var now = DateTime.UtcNow; // nondeterministic
}
```
