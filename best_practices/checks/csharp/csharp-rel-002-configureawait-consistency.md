# CSHARP-REL-002: Context capture policy is consistent where it matters

## Intent

`ConfigureAwait(false)` is not a blanket quality rule. It matters mainly in
reusable libraries or context-sensitive environments. Where a project has a
policy, it should be followed consistently rather than half-applied.

## Applicability

Applies only to:

- reusable libraries intended to run under arbitrary synchronization contexts,
- UI code with an explicit context-capture policy, or
- legacy ASP.NET / context-sensitive code where capture semantics matter.

Return `unknown` for ordinary ASP.NET Core application code unless the repo has
an explicit policy stating otherwise.

## Strategy

`heuristic`

## What to inspect

1. Determine whether the project is a reusable library or a context-sensitive
   app.
2. Check for an existing repository policy around `ConfigureAwait`.
3. Look for inconsistent usage inside the same library boundary.

## Pass criteria

- The project follows a clear policy and applies it consistently where
  applicable.

## Fail criteria

- A reusable library mixes context-free and context-capturing awaits without a
  deliberate reason.
- The project claims a policy but the changed code ignores it.

## Do not flag

- Typical ASP.NET Core request-handling code.
- Tests.
- Code where context affinity is intentional and obvious.

## Evidence to collect

- The affected await sites.
- The repository or project context that makes the rule applicable.

## Confidence guidance

- `HIGH`: reusable library context and inconsistent usage are directly visible.
- `MEDIUM`: project type is inferred from packaging or folder structure.
- `LOW`: prefer `unknown` if app/library status is unclear.

## Remediation

- Define a project-level policy.
- Apply `ConfigureAwait(false)` consistently in reusable library code if that
  is the chosen rule.
- Avoid cargo-cult changes in ASP.NET Core app code.

## Pass example

```csharp
public async Task<string> FetchAsync(CancellationToken ct)
{
    using var response = await _client.SendAsync(_request, ct).ConfigureAwait(false);
    return await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
}
```

## Fail example

```csharp
public async Task<string> FetchAsync(CancellationToken ct)
{
    using var response = await _client.SendAsync(_request, ct);
    return await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
}
```
