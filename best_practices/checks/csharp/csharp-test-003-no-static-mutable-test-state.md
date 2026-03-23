# CSHARP-TEST-003: Tests avoid shared mutable static state

## Intent

Static mutable state makes tests order-dependent, breaks parallel execution,
and creates failures that reviewers cannot reason about from a single test.

## Applicability

Applies to test projects and test fixtures.

Return `unknown` only when the relevant test support code is out of scope.

## Strategy

`static`

## What to inspect

1. Search test code for mutable `static` fields, properties, collections, and
   caches.
2. Determine whether test cases can mutate the shared object across runs.

## Pass criteria

- Shared static data is immutable.
- Shared fixtures isolate or reset state deterministically between tests.

## Fail criteria

- Tests mutate `static` fields or collections shared across cases.
- A singleton fake or cache leaks data between tests.

## Do not flag

- `static readonly` immutable data.
- Constants and lookup tables.
- Explicit test infrastructure that resets state before each test and makes the
  reset obvious.

## Evidence to collect

- The mutable static declaration.
- The mutation site or test path relying on it.

## Confidence guidance

- `HIGH`: the shared mutable static is directly visible.
- `MEDIUM`: the field looks mutable but reset behavior is partly hidden.
- `LOW`: prefer `unknown` if mutability depends on unseen helper code.

## Remediation

- Move state to per-test instances or fixtures.
- Make shared data immutable.
- Reset mutable fixtures explicitly in setup/teardown.

## Pass example

```csharp
public sealed class UserTests
{
    private readonly FakeClock _clock = new();
}
```

## Fail example

```csharp
public sealed class UserTests
{
    private static readonly List<User> Users = new();

    [Fact]
    public void Adds_user() => Users.Add(new User("alice"));
}
```
