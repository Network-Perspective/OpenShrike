# CSHARP-TEST-005: Behavior changes ship with automated test coverage

## Intent

Production behavior changes should be accompanied by tests that make the new
behavior reviewable and protect against regression.

## Applicability

Applies when the diff changes business logic, control flow, validation,
serialization, authorization, persistence behavior, concurrency, or a public
contract.

Return `unknown` when:

- the change is clearly non-behavioral, or
- existing coverage proving the new behavior is not visible in scope.

## Strategy

`reasoning`

## What to inspect

1. Review changed production files for behavioral changes.
2. Look for tests added or updated in the same diff.
3. If no tests changed, check whether the repository already has nearby tests
   that obviously cover the changed behavior.

## Pass criteria

- The diff includes tests covering the changed behavior, or
- existing tests clearly already exercise the changed path.

## Fail criteria

- The PR changes observable behavior with no matching automated test evidence.
- A bug fix or edge-case fix lands without a regression test.

## Do not flag

- Pure refactors with unchanged behavior.
- Comment, formatting, rename, or dependency-only changes.
- Generated code.
- Trivial wiring changes already covered by host startup tests.

## Evidence to collect

- The production change introducing or altering behavior.
- The absence of corresponding test coverage in the diff.

## Confidence guidance

- `HIGH`: the production behavior change is obvious and no relevant tests were
  added or updated.
- `MEDIUM`: the behavior change is clear, but existing coverage may exist
  outside the visible scope.
- `LOW`: prefer `unknown` when the change might be mechanical.

## Remediation

- Add or update tests that exercise the changed behavior.
- For bug fixes, add a regression test that fails before the fix.

## Pass example

```csharp
public Result ApplyDiscount(Order order)
{
    if (order.Total > 100) return Result.Success();
    return Result.Rejected("minimum-total");
}
```

```csharp
[Fact]
public void Rejects_discount_below_minimum_total()
{
    var result = _sut.ApplyDiscount(new Order(total: 75));
    result.ErrorCode.Should().Be("minimum-total");
}
```

## Fail example

```csharp
public Result ApplyDiscount(Order order)
{
    if (order.Total > 100) return Result.Success();
    return Result.Rejected("minimum-total");
}
```

The diff changes discount behavior but adds no tests covering the new branch.
