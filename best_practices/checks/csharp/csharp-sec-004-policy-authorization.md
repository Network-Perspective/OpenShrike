# CSHARP-SEC-004: Use policy-based authorization attributes

## Intent
Authorization should be explicit and consistent across endpoints.

## Step-by-step evaluation
1. Identify protected endpoints or handlers.
2. Verify `[Authorize(Policy = ...)]` or equivalent is used consistently.

## Pass example
```csharp
[Authorize(Policy = "Admin")]
public IActionResult DeleteUser(Guid id) => Ok();
```

## Fail example
```csharp
public IActionResult DeleteUser(Guid id) => Ok(); // no auth
```
