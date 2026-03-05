# CSHARP-ARCH-002: Public APIs follow analyzer rules

## Intent
Public API shape should follow naming and visibility guidance enforced by
analyzers (style, accessibility, consistency).

## Step-by-step evaluation
1. Locate public types and members.
2. Check analyzer rules are not suppressed without justification.
3. Confirm public APIs follow naming/visibility guidelines.

## Pass example
```csharp
public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken ct);
}
```

## Fail example
```csharp
public class user_repo
{
    public User get(Guid id) { return new User(); }
}
```
