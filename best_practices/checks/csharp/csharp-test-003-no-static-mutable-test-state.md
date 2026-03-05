# CSHARP-TEST-003: Avoid static mutable state in tests

## Intent
Static mutable state causes test pollution and order dependence.

## Step-by-step evaluation
1. Scan test assemblies for `static` mutable fields.
2. Ensure shared state is immutable or reset between tests.

## Pass example
```csharp
public class UserTests
{
    private readonly User _user = new("alice");
}
```

## Fail example
```csharp
public class UserTests
{
    private static User _user = new("alice");
}
```
