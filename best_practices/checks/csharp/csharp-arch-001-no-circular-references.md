# CSHARP-ARCH-001: Project references remain acyclic

## Intent

Project and assembly dependencies should form a directed acyclic graph.
Circular references are a concrete architectural defect: they break layering,
make reuse harder, and often turn simple changes into coordinated edits.

## Applicability

Applies to repositories with more than one C# project or assembly.

Return `unknown` when:

- the relevant `.csproj` files are outside the available review scope, or
- the repository is effectively a single-project application.

## Strategy

`static`

## What to inspect

1. Inspect `<ProjectReference>` edges across `.csproj` files.
2. Check whether the changed project introduces or closes a dependency loop.

## Pass criteria

- No project reference cycle exists.
- Test projects may depend on production projects, but production projects do
  not depend back on tests.

## Fail criteria

- A project directly or indirectly references itself through other projects.
- A shared project introduced as a "temporary" utility creates a back-edge into
  a layer that already depends on it.

## Do not flag

- NuGet package references.
- Source-generator or analyzer packages.
- Test-only references that do not create a production cycle.

## Evidence to collect

- The `.csproj` files forming the cycle.
- The exact reference path proving the loop.

## Confidence guidance

- `HIGH`: the cycle is directly visible from `<ProjectReference>` edges.
- `MEDIUM`: the dependency loop is strongly implied but one referenced project
  is outside the visible scope.
- `LOW`: use only if a cycle is suspected but cannot be confirmed; prefer
  `unknown`.

## Remediation

- Extract shared abstractions into a lower-level project.
- Reverse the dependency through an interface or event boundary.
- Remove convenience references that bypass the intended architecture.

## Pass example

```xml
<!-- Api.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\Application\Application.csproj" />
  </ItemGroup>
</Project>
```

```xml
<!-- Application.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\Domain\Domain.csproj" />
  </ItemGroup>
</Project>
```

## Fail example

```xml
<!-- Domain.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\Infrastructure\Infrastructure.csproj" />
  </ItemGroup>
</Project>
```

```xml
<!-- Infrastructure.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\Domain\Domain.csproj" />
  </ItemGroup>
</Project>
```
