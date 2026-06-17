---
id: sec-007
title: Password storage and account recovery resist offline cracking and account takeover
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: book
    title: Alice and Bob Learn Application Security
    author: Tanya Janca
  - type: article
    title: goldbergyoni/nodebestpractices
  - type: standard
    title: Laravel official docs
  - type: article
    title: Cryptographic Right Answers
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
  - type: standard
    title: OWASP Proactive Controls
  - type: standard
    title: OWASP Top 10 (2021, and the 2025 update cycle) + OWASP API Security Top 10 (2023)
  - type: article
    title: PHP The Right Way
  - type: book
    title: SQL Antipatterns
    author: Bill Karwin
  - type: book
    title: Real-World Cryptography
    author: David Wong
---

# sec-007: Password storage and account recovery resist offline cracking and account takeover

## Intent
Make password theft expensive and recovery flows resistant to enumeration, brute force, downgrade, and reuse.

## Applicability
Applies when the diff stores or verifies user passwords, changes reset or recovery flows, updates login throttling, or modifies sensitive account-change flows. Return `unknown` when authentication is fully delegated outside the repository.

## What to inspect
Password hashing APIs, reset-token lifecycles, login throttling, current-password re-verification, and responses that may enumerate accounts.

## Pass criteria
Passwords are stored with adaptive salted password hashing, login or recovery abuse is rate-limited or otherwise throttled, reset flows use single-use expiring out-of-band proofs, and sensitive account changes require fresh proof of identity when applicable.

## Fail criteria
Passwords are stored in plaintext, reversibly, or with fast general hashes; reset or recovery flows are reusable, non-expiring, or enumerating; or sensitive account changes proceed without re-verification.

## Do not flag
Applications that fully delegate password handling to an external IdP. Test fixtures with fake credentials. Legacy hash readers that are not used for new writes.

## Confidence guidance
`HIGH` when storage or recovery logic is directly visible. `MEDIUM` when part of the auth flow is inferred. `LOW` when the real auth system is mostly out of scope.

## Remediation
Use Argon2id, bcrypt, scrypt, or a framework-approved equivalent; make reset tokens single-use and expiring; keep responses non-enumerating; and re-authenticate sensitive account changes.

## Pass example
```php
$hash = password_hash($password, PASSWORD_DEFAULT);
```

## Fail example
```php
$hash = sha1($password);
```
