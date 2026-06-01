# CLEAN-ARCH-005: Frameworks, databases, and IO stay in outer adapters

## Intent

Clean Architecture treats frameworks, databases, web stacks, external
services, operating systems, and hardware APIs as details. Those details should
live in outer adapters, drivers, HAL/OSAL-style seams, or bootstrap code
rather than leaking into business rules.

## Applicability

Applies when the diff touches core policy code or the seams between core policy
and outer adapters in a repository that claims a Clean Architecture split.

Return `unknown` when:

- the repository does not expose a core-versus-detail boundary,
- the diff is isolated to an outer adapter with no sign of leakage inward, or
- the change is too small to establish where the detail code belongs.

## Strategy

`reasoning`

## What to inspect

1. Review changed entity, domain, use case, application, and core modules.
2. Look for framework annotations, framework base classes, SQL, ORM mapping,
   HTML/HTTP formatting, platform APIs, or hardware/OS calls in those modules.
3. Separate stable core policy from detail code that could have lived at the
   edge behind a port.

## Pass criteria

- Persistence, transport, presentation, framework, operating-system, and
  hardware concerns remain in outer adapters or bootstrap code.
- Inner policy layers speak to those concerns only through ports, abstractions,
  or simple boundary data.

## Fail criteria

- Core business code embeds SQL, schema details, HTTP or HTML concerns,
  framework lifecycle hooks, platform APIs, processor registers, or OS calls.
- Framework-specific annotations, base classes, or mapping concerns materially
  couple the inner policy layers to an outer mechanism.

## Do not flag

- Ordinary standard-library usage.
- Outer DTOs, mappers, or HAL/OSAL implementations that are already on the
  detail side of the boundary.
- Stable value objects or domain primitives that are not framework-driven.

## Evidence to collect

- The changed core module.
- The concrete detail-specific code or dependency inside it.
- The outer adapter or seam where that concern should have lived.

## Confidence guidance

- `HIGH`: detail-specific code is directly visible in an inner policy module.
- `MEDIUM`: the coupling is clear, but the inner-versus-outer split is partly
  inferred from repository structure.
- `LOW`: prefer `unknown` when the repository does not clearly distinguish core
  from detail code.

## Remediation

- Push framework, database, transport, and platform code into adapters or
  drivers.
- Introduce a gateway, presenter, HAL/OSAL, or similar outward implementation
  seam.
- Keep core policy code free of mechanism-specific annotations and APIs.
