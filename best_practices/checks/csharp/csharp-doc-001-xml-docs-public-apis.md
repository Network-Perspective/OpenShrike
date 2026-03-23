# CSHARP-DOC-001: Externally consumed public APIs are documented

## Intent

If a repository publishes a reusable library, public APIs should explain
behavior that consumers cannot safely infer from signatures alone.

## Applicability

Applies only to externally consumed libraries and SDKs.

Return `unknown` for internal applications and services.

## Strategy

`reasoning`

## What to inspect

1. Determine whether the project is an externally consumed library.
2. Review changed public members for missing behavioral documentation.

## Pass criteria

- New or changed public APIs include meaningful XML docs or equivalent generated
  documentation for behavior, nullability, side effects, and exceptions where
  those matter to consumers.

## Fail criteria

- A reusable package adds consumer-facing public API with no meaningful
  discoverability documentation.

## Do not flag

- Internal services.
- Obvious overrides or interface implementations whose docs are inherited.
- Trivial DTO properties where the type fully explains the meaning.

## Evidence to collect

- The changed public API.
- Missing or inadequate documentation.

## Confidence guidance

- `HIGH`: reusable library context and undocumented public API are directly
  visible.
- `MEDIUM`: library intent is inferred from packaging.
- `LOW`: prefer `unknown` if consumer expectations are unclear.

## Remediation

- Add XML docs or equivalent public documentation focused on consumer behavior.

## Pass example

```csharp
/// <summary>
/// Sends the command exactly once unless the caller retries after a transport failure.
/// </summary>
public Task SendAsync(Command command, CancellationToken ct);
```

## Fail example

```csharp
public Task SendAsync(Command command, CancellationToken ct);
```
