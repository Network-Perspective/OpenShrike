# CSHARP-SEC-005: Approved cryptography APIs

## Intent
Use vetted cryptography APIs with safe algorithms and defaults.

## Step-by-step evaluation
1. Find cryptography usage.
2. Ensure it uses `System.Security.Cryptography` with approved algorithms.

## Pass example
```csharp
using var sha = SHA256.Create();
var hash = sha.ComputeHash(data);
```

## Fail example
```csharp
var md5 = MD5.Create();
var hash = md5.ComputeHash(data);
```
