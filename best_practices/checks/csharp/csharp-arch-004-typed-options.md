# CSHARP-ARCH-004: Configuration is bound to validated options

## Intent

Configuration should be explicit, typed, and validated close to startup.
Scattered string-key lookups make configuration invisible to reviewers and turn
simple mistakes into runtime failures.

## Applicability

Applies when the code introduces or changes application configuration beyond a
single one-off lookup.

Return `unknown` when:

- the code only reads a single primitive once in the composition root, or
- the repository does not use the options pattern and the change does not touch
  configuration structure.

## Strategy

`heuristic`

## What to inspect

1. Find repeated `IConfiguration["Section:Key"]` lookups or direct section
   traversal in application code.
2. Check whether related settings are represented by an options class.
3. Check whether required options are validated at startup.

## Pass criteria

- Related settings are represented by an options type.
- The options are bound once and injected where used.
- Required settings are validated using data annotations, custom validators, or
  equivalent startup validation.

## Fail criteria

- Business logic repeatedly reads string keys from `IConfiguration`.
- A new settings section is introduced with no typed model.
- Security- or reliability-critical settings are bound but never validated.

## Do not flag

- Reading a connection string once during composition.
- Feature flags or environment names read once in startup code.
- Test configuration setup.

## Evidence to collect

- Repeated string-key lookups.
- The bound options class and its validation, if present.

## Confidence guidance

- `HIGH`: repeated string-key lookups or missing validation are directly visible.
- `MEDIUM`: the code suggests a configuration section exists, but binding code
  is out of scope.
- `LOW`: prefer `unknown` if the changed code touches config only indirectly.

## Remediation

- Create a dedicated options type for the section.
- Bind it in startup.
- Validate required fields on start.

## Pass example

```csharp
builder.Services
    .AddOptions<MailOptions>()
    .Bind(builder.Configuration.GetSection("Mail"))
    .ValidateDataAnnotations()
    .ValidateOnStart();

public sealed class Mailer
{
    private readonly MailOptions _options;

    public Mailer(IOptions<MailOptions> options)
    {
        _options = options.Value;
    }
}
```

## Fail example

```csharp
public sealed class Mailer
{
    public Mailer(IConfiguration configuration)
    {
        _host = configuration["Mail:Host"]!;
        _port = int.Parse(configuration["Mail:Port"]!);
        _user = configuration["Mail:User"]!;
    }
}
```
