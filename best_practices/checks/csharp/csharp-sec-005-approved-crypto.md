# CSHARP-SEC-005: Cryptography uses modern platform primitives

## Intent

Security-sensitive cryptography should use well-understood platform APIs and
modern primitives. Review should fail obvious misuse, not debate niche
cryptographic style.

## Applicability

Applies when the code hashes passwords, signs tokens, encrypts data, derives
keys, or generates security-sensitive randomness.

Return `unknown` when the changed code references crypto indirectly through a
well-known library and the implementation is out of scope.

## Strategy

`static`

## What to inspect

1. Find `System.Security.Cryptography` usage and any custom crypto helpers.
2. Look for obsolete or weak primitives, hard-coded keys, predictable IVs, and
   non-cryptographic randomness.

## Pass criteria

- The code uses platform primitives and a modern algorithm appropriate to the
  task.
- Keys, IVs, and nonces are generated and managed safely.
- Password hashing uses a purpose-built password KDF, not a general hash.

## Fail criteria

- The code uses MD5 or SHA1 for a security decision.
- A custom crypto algorithm or protocol is introduced.
- Encryption uses hard-coded keys or deterministic IVs/nonces.
- Security-sensitive randomness comes from `Random`.

## Do not flag

- MD5 or other weak hashes used only for non-security checksums where that
  purpose is obvious.
- Well-vetted third-party security libraries used through their normal API.

## Evidence to collect

- The crypto API usage.
- The key, IV, nonce, or randomness handling.

## Confidence guidance

- `HIGH`: weak primitives or unsafe key/nonce handling are directly visible.
- `MEDIUM`: crypto misuse is likely, but one part of the flow is hidden.
- `LOW`: prefer `unknown` if the security purpose is unclear.

## Remediation

- Use modern platform primitives suited to the task.
- Replace custom or weak algorithms.
- Generate secrets and nonces with cryptographic randomness.

## Pass example

```csharp
var salt = RandomNumberGenerator.GetBytes(16);
var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600_000, HashAlgorithmName.SHA256, 32);
```

## Fail example

```csharp
var key = Encoding.UTF8.GetBytes("hard-coded-key-123");
using var md5 = MD5.Create();
var hash = md5.ComputeHash(data);
```
