# CSHARP-ARCH-001: No circular project/assembly references

## Intent
Project/assembly references must be acyclic at build time to keep architecture
clean and avoid build failures.

## Strategy
`static` — resolvable by inspecting `.csproj` project reference graphs.

## Step-by-step evaluation
1. Build or inspect the project reference graph.
2. Confirm there is no cycle (A -> B -> A, or longer loops).

## Pass example
```xml
<!-- A.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\\B\\B.csproj" />
  </ItemGroup>
</Project>
```
```xml
<!-- B.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\\C\\C.csproj" />
  </ItemGroup>
</Project>
```

## Fail example
```xml
<!-- A.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\\B\\B.csproj" />
  </ItemGroup>
</Project>
```
```xml
<!-- B.csproj -->
<Project>
  <ItemGroup>
    <ProjectReference Include="..\\A\\A.csproj" />
  </ItemGroup>
</Project>
```

## Confidence guidance
- **HIGH**: Cycle found by tracing `<ProjectReference>` elements across `.csproj` files.
- **MEDIUM**: Suspicious pattern (e.g., shared project with back-references) but
  cycle not fully confirmed.
- **LOW**: Unable to resolve all project references (e.g., missing files in diff).
