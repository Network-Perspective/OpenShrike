---
id: sec-008
title: Client-facing errors, URLs, and public responses do not leak secrets or internals
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: book
    title: Alice and Bob Learn Application Security
  - type: standard
    title: Bandit Rule Documentation + Semgrep Python Security Rules
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: book
    title: Design and Build Great Web APIs
  - type: standard
    title: Microsoft REST API Guidelines + Zalando RESTful API Guidelines
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
  - type: standard
    title: OWASP Top 10 2021 and the 2025 Update Cycle + OWASP API Security Top 10 2023
  - type: book
    title: Secure by Design
  - type: standard
    title: Swift API Design Guidelines
---

# sec-008: Client-facing errors, URLs, and public responses do not leak secrets or internals

## Intent
Keep attacker-visible surfaces from becoming a reconnaissance channel or a durable secret leak.

## Applicability
Applies when the diff changes client-facing errors, response bodies, DTOs, debug behavior, URLs, redirects, or other externally visible fields. Return `unknown` when the public surface is not visible.

## What to inspect
Error handlers, debug settings, response DTOs, URL query strings, redirects, and whether secret or internal fields are exposed.

## Pass criteria
Client-facing failures are generic or structured without internal stack traces or secret material, and public or GET-visible responses omit credentials, tokens, connection strings, and similar sensitive internals.

## Fail criteria
The code exposes stack traces, SQL text, internal paths, host details, debug pages, tokens, session identifiers, or other sensitive internals through responses, URLs, or public DTOs.

## Do not flag
Protected internal logs. Intentional opaque IDs. One-time secret issuance on a non-GET creation or rotation path. Local-only developer tooling clearly excluded from production.

## Confidence guidance
`HIGH` when the leak is directly visible. `MEDIUM` when the response type likely contains sensitive fields. `LOW` when the public surface is not fully shown.

## Remediation
Return generic external errors, keep secrets out of URLs and public DTOs, and restrict debug or internal details to protected operational channels.

## Pass example
```json
{"type":"about:blank","title":"Request failed","status":400}
```

## Fail example
```json
{"error":"SqlException at C:\\src\\app\\db.cs:42", "connectionString":"..."}
```
