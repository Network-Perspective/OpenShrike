---
id: sec-009
title: Cryptography and transport use approved primitives, CSPRNGs, and full TLS verification
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: standard
    title: "Bandit Rule Documentation: Semgrep Python Security Rules"
  - type: standard
    title: Brakeman Warning Documentation
  - type: book
    title: Building Secure and Reliable Systems
  - type: book
    title: "Data Privacy: A Runbook for Engineers"
  - type: book
    title: Designing Secure Software
    author: Loren Kohnfelder
  - type: standard
    title: "Effective Go: Go Code Review Comments"
  - type: standard
    title: Google Go Style Guide
  - type: article
    title: The Cryptographic Right Answers
  - type: standard
    title: NIST Privacy Framework / NIST SP 800-122 PII Protection
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Proactive Controls
  - type: book
    title: Real-World Cryptography
  - type: article
    title: "Survive the Deep End: PHP Security"
---

# sec-009: Cryptography and transport use approved primitives, CSPRNGs, and full TLS verification

## Intent
Prevent security controls from depending on broken primitives, custom crypto, predictable randomness, or unverified TLS peers.

## Applicability
Applies when the diff hashes passwords or secrets, signs or verifies tokens, encrypts data, derives keys, generates security-sensitive randomness, or makes TLS-protected outbound calls. Return `unknown` when a well-known library is used indirectly and implementation details are out of scope.

## What to inspect
Crypto APIs, algorithm selection, nonce or IV handling, randomness sources, MAC or AEAD usage, and TLS verification options.

## Pass criteria
The code uses approved modern primitives, CSPRNG-backed secrets or nonces, authenticated encryption or integrity protection where needed, and leaves peer and hostname verification enabled for TLS.

## Fail criteria
The code introduces custom crypto, weak hashes or ciphers for security decisions, predictable or reused nonces or IVs, non-cryptographic RNG for security-sensitive values, or disables TLS verification.

## Do not flag
Obvious non-security checksums. Well-vetted security libraries used through normal APIs. Local test fixtures with clearly fake certificates.

## Confidence guidance
`HIGH` when weak primitives or disabled verification are directly visible. `MEDIUM` when one part of the crypto flow is hidden. `LOW` when the security purpose is unclear.

## Remediation
Use platform or library primitives appropriate to the job, generate secrets with a CSPRNG, keep TLS verification on, and use authenticated encryption or explicit integrity protection.

## Pass example
```python
token = secrets.token_urlsafe(32)
```

## Fail example
```python
token = str(random.random())
```
