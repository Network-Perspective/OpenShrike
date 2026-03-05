# CSHARP-OPS-004: Minimal container images with multi-stage builds

## Intent
Use multi-stage builds and minimal runtimes to reduce attack surface.

## Step-by-step evaluation
1. Inspect Dockerfile.
2. Confirm multi-stage build and minimal final image.

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
RUN dotnet run
```
