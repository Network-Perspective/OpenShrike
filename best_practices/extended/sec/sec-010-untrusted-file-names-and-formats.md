---
id: sec-010
title: Files, uploads, archives, and XML parsing constrain untrusted names and formats
domain: sec
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: "Bandit Rule Documentation: Semgrep Python Security Rules"
  - type: standard
    title: Brakeman Warning Documentation
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: article
    title: PHP The Right Way
  - type: standard
    title: PHPStan / Psalm Rule Documentation
  - type: standard
    title: Rails Security Guide
  - type: book
    title: Secure by Design
  - type: article
    title: "Survive the Deep End: PHP Security"
---

# sec-010: Files, uploads, archives, and XML parsing constrain untrusted names and formats

## Intent
Prevent path traversal, dangerous upload handling, unsafe archive extraction, and hostile XML parsing from turning attacker-controlled names or formats into filesystem or parser compromise.

## Applicability
Applies when the diff accepts uploaded files, reads or writes filesystem paths from external input, extracts archives, creates temporary files, or parses XML from untrusted sources. Return `unknown` when containment or parser hardening is hidden in helpers.

## What to inspect
Filename or path joins, upload validation, public storage locations, archive extraction helpers, temporary-file creation, and XML parser configuration.

## Pass criteria
Paths are resolved under an approved root, uploads use explicit type and size controls plus server-generated storage paths, archive extraction filters unsafe members, temporary files use secure APIs, and XML parsing disables unsafe external entities or expansion.

## Fail criteria
Raw input chooses filesystem paths, uploads trust client names or content types alone, archives extract directly without filtering, temporary files use race-prone patterns, or XML parsing leaves unsafe entity resolution enabled.

## Do not flag
Constant internal paths. Opaque-ID lookups that resolve to server-generated paths. Trusted internal admin imports with clearly bounded sources.

## Confidence guidance
`HIGH` when the unsafe path or parser setting is directly visible. `MEDIUM` when safety may be delegated to helpers. `LOW` when the actual storage or parser path is hidden.

## Remediation
Resolve paths under a fixed root, generate server-side filenames, filter archive members, use secure temporary-file APIs, and harden XML parsers for untrusted input.

## Pass example
```python
with tempfile.NamedTemporaryFile(delete=False) as f:
    f.write(data)
```

## Fail example
```python
name = tempfile.mktemp()
```
