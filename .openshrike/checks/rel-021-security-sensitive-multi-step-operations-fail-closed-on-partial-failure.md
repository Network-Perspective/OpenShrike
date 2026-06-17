---
id: rel-021
title: Security-sensitive multi-step operations fail closed on partial failure
domain: rel
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: OWASP Top 10 (2021, and the 2025 update cycle) + OWASP API Security Top 10 (2023)
    section: "A10:2025 Mishandling of Exceptional Conditions"
---

# rel-021: Security-sensitive multi-step operations fail closed on partial failure

## Intent
Prevent exploitable or corrupted partial state when a security-sensitive workflow fails mid-flight.

## Applicability
Applies to auth changes, privilege changes, token issuance, and similar multi-step security-sensitive flows.

## What to inspect
Transaction boundaries, compensation, partial updates, and external error behavior.

## Pass criteria
The flow either commits atomically or reverts incomplete security-sensitive changes before returning.

## Fail criteria
The diff can leave partial privileged state, half-issued credentials, or half-applied auth changes after an error.

## Do not flag
Read-only validation paths.

## Confidence guidance
`HIGH` when partial state is directly visible. `MEDIUM` when rollback may exist in an unseen helper. `LOW` when state boundaries are incomplete.

## Remediation
Wrap the workflow in an atomic transaction or add fail-closed rollback for partial state.

## Pass example
```sql
BEGIN; UPDATE users SET mfa_enabled = true; INSERT INTO secrets ...; COMMIT;
```

## Fail example
```sql
UPDATE users SET mfa_enabled = true;
-- later step fails before secret is stored
```
