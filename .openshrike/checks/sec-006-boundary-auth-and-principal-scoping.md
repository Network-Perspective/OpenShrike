---
id: sec-006
title: Protected operations enforce authentication, authorization, and principal scoping at the boundary
domain: sec
language: shared
app-type: [http-service, batch-job, other]
status: active
sources:
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: book
    title: Design and Build Great Web APIs
    author: Mike Amundsen
  - type: book
    title: Designing Secure Software
    author: Loren Kohnfelder
    year: 2021
  - type: standard
    title: Google API Improvement Proposals
  - type: standard
    title: Laravel official docs
  - type: standard
    title: Microsoft REST API Guidelines + Zalando RESTful API Guidelines
  - type: standard
    title: NIST Privacy Framework + NIST SP 800-122
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP NodeGoat + OWASP Node.js Security Cheat Sheet
  - type: standard
    title: OWASP Proactive Controls
  - type: standard
    title: OWASP Top 10 (2021, and the 2025 update cycle) + OWASP API Security Top 10 (2023)
  - type: standard
    title: Spring Boot official docs
  - type: standard
    title: Rails Security Guide
  - type: standard
    title: Brakeman warning documentation
---

# sec-006: Protected operations enforce authentication, authorization, and principal scoping at the boundary

## Intent
Ensure sensitive operations and protected data are guarded where the request enters the system, with explicit action or object-level rules that cannot be bypassed by changing identifiers or routes.

## Applicability
Applies to HTTP endpoints, RPC methods, hubs, background consumers, admin actions, and other externally reachable operations. Return `unknown` when route exposure or central policy wiring is outside scope.

## What to inspect
Boundary auth declarations, policy or scope checks, object ownership or tenant scoping, admin endpoints, and existence checks that occur before authorization.

## Pass criteria
Protected routes require authentication and explicit authorization, sensitive object access is scoped to the current principal or tenant, and unauthorized callers do not learn protected resource existence before access checks.

## Fail criteria
Sensitive operations are exposed anonymously, authenticated users can reach actions or records outside their authorization, or the code relies only on client checks or unscoped identifiers.

## Do not flag
Clearly public endpoints such as health, login, or signed webhooks with a different explicit auth mechanism. Internal helpers that are not boundaries. Resource checks that complement, rather than replace, boundary auth.

## Confidence guidance
`HIGH` when a privileged route or record access path is visible with no effective boundary guard or scoping. `MEDIUM` when exposure is inferred. `LOW` when route visibility is unclear.

## Remediation
Add explicit authentication and authorization at the boundary, scope record lookups by the current principal, and authorize before returning resource-specific existence signals.

## Pass example
```csharp
[Authorize(Policy = Policies.Admin)]
public Task<IActionResult> DeleteUser(Guid id) => ...
```

## Fail example
```csharp
[HttpDelete("/users/{id}")]
public Task<IActionResult> DeleteUser(Guid id) => ...
```
