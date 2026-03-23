# CSHARP-OPS-002: Operational logs are structured and correlate work

## Intent

Production logs should be queryable and traceable. Message-template logging
with stable identifiers is far more useful than interpolated strings and
context-free messages.

## Applicability

Applies to production-facing application and service code that emits logs.

Return `unknown` when the code change does not touch logging or operational
flows.

## Strategy

`static`

## What to inspect

1. Review new or changed log statements.
2. Check whether they use message templates and preserve exceptions.
3. Check whether request, job, or correlation identifiers flow through the log
   context for long-running work.

## Pass criteria

- Log statements use structured templates with named properties.
- Exceptions are logged with the exception object.
- Important workflows include stable identifiers or scope context.

## Fail criteria

- New log statements use string interpolation or concatenation.
- Exception details are flattened into a string instead of logged as an
  exception.
- Important async/background work emits logs with no identifiers.

## Do not flag

- Test code.
- One-off dev tooling.
- Simple startup banners that are not operational diagnostics.

## Evidence to collect

- The logging statement.
- Missing identifiers or exception object usage.

## Confidence guidance

- `HIGH`: unstructured logging is directly visible.
- `MEDIUM`: correlation context likely matters, but the broader workflow is
  inferred.
- `LOW`: prefer `unknown` if the log line is not operationally meaningful.

## Remediation

- Use message templates with named properties.
- Preserve the exception object.
- Add request, job, or correlation identifiers through scopes or tracing
  context.

## Pass example

```csharp
using (_logger.BeginScope(new Dictionary<string, object> { ["OrderId"] = orderId }))
{
    _logger.LogInformation("Processing order {OrderId}", orderId);
}
```

## Fail example

```csharp
_logger.LogInformation($"Processing order {orderId}");
```
