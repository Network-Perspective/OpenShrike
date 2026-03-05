# CSHARP-ARCH-004: Strongly-typed configuration via IOptions<T>

## Intent
Configuration should be bound to typed options to reduce runtime errors.

## Step-by-step evaluation
1. Identify configuration usage in the project.
2. Prefer `IOptions<T>` or `IOptionsMonitor<T>` for configuration access.

## Pass example
```csharp
builder.Services.Configure<MailOptions>(
    builder.Configuration.GetSection("Mail"));

public class Mailer
{
    private readonly MailOptions _options;
    public Mailer(IOptions<MailOptions> options) => _options = options.Value;
}
```

## Fail example
```csharp
var host = config["Mail:Host"]; // string lookup everywhere
```
