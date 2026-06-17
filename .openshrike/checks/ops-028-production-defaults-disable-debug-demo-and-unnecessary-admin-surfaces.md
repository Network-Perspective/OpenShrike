---
id: ops-028
title: Production defaults disable debug, demo, and unnecessary admin surfaces
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: standard
    title: OWASP Proactive Controls
    chapter: "C5: Secure By Default Configurations"
---

# ops-028: Production defaults disable debug, demo, and unnecessary admin surfaces

## Intent
Prevent accidental exposure of dangerous runtime features that widen attack surface in deployed environments.

## Applicability
Applies when the diff changes runtime configuration defaults, startup flags, or feature toggles for deployable software.

## What to inspect
Debug flags, demo-mode settings, admin consoles, sample credentials, and default production-oriented profiles.

## Pass criteria
Production-facing defaults disable debug, demo, and unnecessary admin surfaces unless a separate secure opt-in is required.

## Fail criteria
The diff enables debug mode, demo users, or unneeded administrative surfaces in default or production-oriented configuration.

## Do not flag
Local-only development profiles or disabled-by-default admin tools with clear access restrictions.

## Confidence guidance
`HIGH` when production or default config explicitly enables debug or demo behavior. `MEDIUM` when profile resolution is indirect. `LOW` when production reachability is unclear.

## Remediation
Turn the feature off in secure defaults and require explicit development-only enablement when needed.

## Pass example
```yaml
app:
  debug: false
  demoMode: false
  adminConsoleEnabled: false
```

## Fail example
```yaml
app:
  debug: true
  demoMode: true
  adminConsoleEnabled: true
```
