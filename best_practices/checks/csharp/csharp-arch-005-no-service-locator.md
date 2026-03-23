# CSHARP-ARCH-005: Application code does not use the service locator pattern

## Intent

Dependencies should be visible in constructors and explicit factory seams.
Pulling services from `IServiceProvider` inside business logic hides coupling,
defers failures, and makes testing harder.

## Applicability

Applies to DI-based applications and services.

Return `unknown` when:

- the project does not use a DI container, or
- only framework bootstrap code is visible.

## Strategy

`static`

## What to inspect

1. Search for `IServiceProvider`, `GetRequiredService`, `GetService`, and
   `BuildServiceProvider`.
2. Determine whether the usage is in composition code or in runtime business
   logic.

## Pass criteria

- Runtime code receives dependencies through constructors or explicit factory
  interfaces.
- `IServiceProvider` usage, if present, stays in composition infrastructure or
  tightly scoped framework glue.

## Fail criteria

- Application services, handlers, controllers, or domain code call
  `GetRequiredService` to pull collaborators at runtime.
- Registration code builds secondary service providers.
- The code stores `IServiceProvider` for later ad hoc resolution.

## Do not flag

- Framework extension points that must receive `IServiceProvider`.
- Background-service infrastructure creating a scope to resolve scoped
  dependencies for one unit of work.
- Well-scoped factory delegates in the composition root.

## Evidence to collect

- The runtime class using `IServiceProvider`.
- The resolved service types and call sites.

## Confidence guidance

- `HIGH`: runtime service-locator usage is directly visible.
- `MEDIUM`: the usage may be infrastructure glue, but the boundary is unclear.
- `LOW`: prefer `unknown` when only a fragment of bootstrap code is visible.

## Remediation

- Inject the dependency directly.
- Introduce a narrow factory interface where late binding is required.
- Move resolution logic back to the composition root.

## Pass example

```csharp
public sealed class InvoiceHandler
{
    private readonly IInvoiceRepository _repository;
    private readonly IClock _clock;

    public InvoiceHandler(IInvoiceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }
}
```

## Fail example

```csharp
public sealed class InvoiceHandler
{
    private readonly IServiceProvider _services;

    public InvoiceHandler(IServiceProvider services)
    {
        _services = services;
    }

    public Task HandleAsync()
    {
        var repository = _services.GetRequiredService<IInvoiceRepository>();
        return repository.FlushAsync();
    }
}
```
