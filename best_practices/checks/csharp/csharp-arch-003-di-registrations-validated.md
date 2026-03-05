# CSHARP-ARCH-003: DI registrations validated at startup

## Intent
Ensure dependency injection registrations are validated early to detect missing
services before runtime.

## Step-by-step evaluation
1. Find the DI setup (Startup/Program).
2. Confirm service provider validation is enabled in non-test environments.

## Pass example
```csharp
builder.Services.AddOptions();

builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

## Fail example
```csharp
var provider = builder.Services.BuildServiceProvider();
// No validation configured
```
