---
id: data-024
title: Consent records preserve the disclosure version the user accepted
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: "Data Privacy: A Runbook for Engineers"
    section: "ch. 9.3 Disclosure Version table and User Consent table; ch. 9.4 API to update consent status for disclosure"
---

# data-024: Consent records preserve the disclosure version the user accepted

## Intent
Keep consent evidence auditable against the exact disclosure text or version the user saw.

## Applicability
Applies to consent, notice acceptance, and disclosure acknowledgements. Return `unknown` when consent storage is external.

## What to inspect
Consent tables, event payloads, version identifiers, notice templates, and acceptance records.

## Pass criteria
Consent records include the disclosure or notice version the user accepted.

## Fail criteria
Consent is stored only as a boolean or timestamp with no disclosure version reference.

## Do not flag
Non-versioned acknowledgements that are explicitly outside regulatory or policy scope.

## Confidence guidance
`HIGH` when a consent record lacks any disclosure version field. `MEDIUM` when the version may be implicit elsewhere. `LOW` when only UI copy changed.

## Remediation
Store a stable notice or disclosure version alongside the acceptance record.

## Pass example
```json
{ "accepted": true, "notice_version": "privacy-2026-04" }
```

## Fail example
```json
{ "accepted": true }
```
