# CSHARP-TEST-001: Async tests avoid Task.Result / .Wait()

## Intent
Blocking async tasks in tests can deadlock and hide async bugs.

## Step-by-step evaluation
1. Locate test code that uses async APIs.
2. Ensure tests use `await` instead of `.Result` or `.Wait()`.

## Pass example
```csharp
[Fact]
public async Task Calculates_Total()
{
    var total = await _sut.CalculateAsync();
    total.Should().Be(42);
}
```

## Fail example
```csharp
[Fact]
public void Calculates_Total()
{
    var total = _sut.CalculateAsync().Result;
    total.Should().Be(42);
}
```
