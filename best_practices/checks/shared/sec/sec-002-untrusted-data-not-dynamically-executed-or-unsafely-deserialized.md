---
id: sec-002
title: Untrusted data is not dynamically executed or unsafely deserialized
domain: sec
language: shared
app-type:
  - any
status: active
sources:
  - type: report
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: documentation
    title: Error Prone Bug Patterns Documentation
  - type: standard
    title: OWASP Proactive Controls
  - type: report
    title: OWASP Top 10 2021 and the 2025 Update Cycle; OWASP API Security Top 10 2023
  - type: documentation
    title: Bandit Rule Documentation; Semgrep Python Security Rules
  - type: documentation
    title: Brakeman Warning Documentation
  - type: article
    title: "PHP: The Right Way"
  - type: documentation
    title: PHPStan/Psalm Rule Documentation
  - type: guide
    title: Rails Security Guide
  - type: documentation
    title: RuboCop, RuboCop Rails, RuboCop Performance Rule Docs
  - type: article
    title: "Survive the Deep End: PHP Security"
  - type: cheat-sheet
    title: OWASP NodeGoat; OWASP Node.js Security Cheat Sheet
---

# sec-002: Untrusted data is not dynamically executed or unsafely deserialized

## Intent
Keep attacker-controlled data from becoming executable code, type metadata, or rich object graphs with dangerous behavior.

## Applicability
Applies when the diff evaluates runtime code, deserializes non-trivial objects, loads YAML or similar rich formats, or uses deserialization APIs on external or semi-trusted input. Return `unknown` when loader choice is hidden behind wrappers.

## What to inspect
`eval`-style APIs, object deserializers, unsafe YAML loaders, JNDI-like remote object lookups, and type-selection logic derived from input.

## Pass criteria
External data is parsed as data through safe fixed-contract formats, and dynamic execution is avoided on untrusted paths.

## Fail criteria
Untrusted data reaches `eval`, `exec`, `new Function`, unsafe object deserializers, remote lookup mechanisms that rehydrate objects, or attacker-controlled type metadata.

## Do not flag
Trusted offline tooling with repository-owned input. Build-time code generation. Safe DTO binding. Serialization-only code with no unsafe deserialization path.

## Confidence guidance
`HIGH` when the unsafe API and untrusted input path are directly visible. `MEDIUM` when trust level is inferred. `LOW` when loader choice is hidden.

## Remediation
Use safe schema-driven formats, safe loaders, and explicit dispatch tables. Keep untrusted data as data, not code.

## Pass example
```python
payload = json.loads(body)
```

## Fail example
```python
payload = pickle.loads(body)
```
