# CSHARP-ARCH-003: Dependency injection is validated early

## Intent

Service registration errors should fail fast during startup or automated
verification, not at the first production request.

## Applicability

Applies to applications that build a root container with
`Microsoft.Extensions.DependencyInjection`.

Return `unknown` when:

- the project is a library with no application startup path, or
- container construction is not visible in scope.

## Strategy

`heuristic`

## What to inspect

1. Find `Program`, `Startup`, host builder code, or equivalent composition
   root.
2. Check whether service provider validation is enabled or whether the app has
   an equivalent startup verification path.
3. Look for ad hoc `BuildServiceProvider()` calls inside registration code.

## Pass criteria

- The app enables validation such as `ValidateScopes` and `ValidateOnBuild`, or
- the repository clearly builds the app/container in tests to catch wiring
  defects before runtime.

## Fail criteria

- Registration code calls `BuildServiceProvider()` to resolve services while
  still configuring the container.
- The startup code explicitly disables validation in normal application paths.
- A composition-root change introduces obvious missing registrations and there
  is no early validation mechanism.

## Do not flag

- Library projects with extension methods like `AddMyFeature(...)`.
- Tests that intentionally build a service provider.
- Legitimate factories registered with DI that do not create a second root
  container.

## Evidence to collect

- Startup or host-builder configuration.
- Any `BuildServiceProvider()` usages in registration code.

## Confidence guidance

- `HIGH`: validation is explicitly present or explicitly bypassed.
- `MEDIUM`: the project clearly uses DI, but validation is inferred missing.
- `LOW`: prefer `unknown` if startup code is out of scope.

## Remediation

- Enable startup validation in non-test environments.
- Remove container-building from registration code.
- Add a startup smoke test that builds the host and resolves critical services.

## Pass example

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

## Fail example

```csharp
builder.Services.AddSingleton<IMailer>(_ =>
{
    using var provider = builder.Services.BuildServiceProvider();
    return provider.GetRequiredService<SmtpMailer>();
});
```
