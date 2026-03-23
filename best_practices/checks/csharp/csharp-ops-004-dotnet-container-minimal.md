# CSHARP-OPS-004: Container images separate build from runtime

## Intent

Production container images should carry only what is needed to run the app.
Keeping SDK tools and source layout in the final image expands attack surface
and slows distribution.

## Applicability

Applies when the repository builds or ships a .NET container image.

Return `unknown` when the container build definition is not visible.

## Strategy

`static`

## What to inspect

1. Inspect `Dockerfile` or equivalent container build definition.
2. Check whether build/publish steps happen in a build stage and the final image
   is a runtime image.

## Pass criteria

- The image uses a multi-stage build.
- The final stage is a runtime-only base, not the SDK image.
- Source, test assets, and build toolchain do not remain in the final image.

## Fail criteria

- The final image is based on `dotnet/sdk`.
- The app is built directly in the runtime image.
- The final image includes the full source tree or unnecessary build tools.

## Do not flag

- Repositories that do not ship containers.
- Build container definitions used only for CI and not as runtime images.

## Evidence to collect

- The container file stages and base images.

## Confidence guidance

- `HIGH`: the runtime image is obviously the SDK or includes build steps.
- `MEDIUM`: the runtime image contents are partly inferred from copy steps.
- `LOW`: prefer `unknown` if only fragments of the container file are visible.

## Remediation

- Use a build stage and a separate runtime stage.
- Copy only published outputs into the runtime image.

## Pass example

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "App.dll"]
```

## Fail example

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o /app/out
ENTRYPOINT ["dotnet", "/app/out/App.dll"]
```
