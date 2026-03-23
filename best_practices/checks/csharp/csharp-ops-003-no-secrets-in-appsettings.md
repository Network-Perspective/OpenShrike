# CSHARP-OPS-003: Committed settings files do not contain secrets

## Intent

Source-controlled settings should define configuration shape, not store live
credentials. Committed secrets leak into forks, logs, developer machines, and
build systems.

## Applicability

Applies to `appsettings*.json`, environment-specific settings files, Helm
values, and other committed configuration artifacts.

Return `unknown` when only generated samples are visible and the real config
path is elsewhere.

## Strategy

`static`

## What to inspect

1. Review committed settings files.
2. Look for connection strings with credentials, passwords, tokens, API keys,
   cert material, and private keys.

## Pass criteria

- Config files contain placeholders, references, or non-secret metadata.
- Sensitive values are sourced from environment variables, secret stores, or
  deployment config outside the repo.

## Fail criteria

- A committed settings file contains plaintext secrets.
- A connection string with embedded credentials is committed.
- Private key material or certificate contents are committed as config.

## Do not flag

- Localhost URLs.
- Secret names, key identifiers, or placeholder values.
- Sample files that are clearly inert and sanitized.

## Evidence to collect

- The committed secret value or credential-bearing connection string.

## Confidence guidance

- `HIGH`: a live secret is directly visible.
- `MEDIUM`: the value strongly resembles a secret but may be a placeholder.
- `LOW`: prefer `unknown` if the value cannot be distinguished from a sample.

## Remediation

- Remove the secret from source control.
- Rotate the credential if exposure is real.
- Replace it with a secret reference or environment-based binding.

## Pass example

```json
{
  "ConnectionStrings": {
    "MainDb": "${MAIN_DB_CONNECTION_STRING}"
  }
}
```

## Fail example

```json
{
  "ConnectionStrings": {
    "MainDb": "Server=db;Database=app;User Id=sa;Password=Secret123!"
  }
}
```
