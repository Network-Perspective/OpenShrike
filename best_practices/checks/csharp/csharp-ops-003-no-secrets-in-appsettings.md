# CSHARP-OPS-003: No secrets in appsettings.*.json

## Intent
Appsettings files should not contain secrets; use secret stores instead.

## Step-by-step evaluation
1. Scan `appsettings*.json` for keys like passwords, tokens, keys.
2. Ensure secrets are pulled from environment or secret manager.

## Pass example
```json
{
  "ConnectionStrings": {
    "Main": "${DB_CONNECTION_STRING}"
  }
}
```

## Fail example
```json
{
  "ConnectionStrings": {
    "Main": "Server=...;User Id=sa;Password=Secret123!"
  }
}
```
