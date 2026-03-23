# CSHARP-ARCH-002: Published libraries govern public API changes

## Intent

Reusable libraries should treat their public surface area as a compatibility
contract. Analyzer- or baseline-backed API governance prevents accidental
breaking changes and noisy drift.

## Applicability

Applies only when the repository clearly publishes a reusable library or shared
package consumed outside the current application boundary.

Return `unknown` when:

- the code under review is an internal application with no public package
  contract, or
- packaging and consumer expectations are not visible.

## Strategy

`heuristic`

## What to inspect

1. Look for package-producing projects or shared libraries with public types.
2. Check whether API governance tooling exists, such as PublicApiAnalyzers,
   ApiCompat, generated public API baselines, or an equivalent mechanism.
3. Review suppressions for public API warnings.

## Pass criteria

- Public API changes are guarded by analyzer/baseline tooling, or
- the repository has an equivalent explicit compatibility gate.

## Fail criteria

- A reusable library adds or changes public surface area with no visible API
  governance.
- Public API warnings are suppressed without a concrete compatibility reason.

## Do not flag

- ASP.NET Core apps whose "public API" is HTTP endpoints rather than a shipped
  assembly contract.
- Internal classes marked `public` only for technical reasons inside a single
  deployable.
- Test projects.

## Evidence to collect

- The changed public API.
- The missing or bypassed API governance configuration.

## Confidence guidance

- `HIGH`: package/library context and missing governance are directly visible.
- `MEDIUM`: the project appears reusable, but consumer scope is partly inferred.
- `LOW`: use only if library intent is weakly implied; otherwise return
  `unknown`.

## Remediation

- Add PublicApiAnalyzers, ApiCompat, or an equivalent public surface baseline.
- Record intentional public API changes explicitly instead of allowing silent
  drift.

## Pass example

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.CodeAnalysis.PublicApiAnalyzers" Version="3.3.4" PrivateAssets="all" />
</ItemGroup>
```

```csharp
[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("MyLibrary.Tests")]
```

## Fail example

```csharp
public class ClientV2
{
    public Task<string> FetchAsync() => Task.FromResult("ok");
}
```

The project adds a new public client type but has no visible public API
baseline, analyzer, or compatibility gate.
