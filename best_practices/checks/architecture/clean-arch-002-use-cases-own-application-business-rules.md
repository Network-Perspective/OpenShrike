# CLEAN-ARCH-002: Application business rules live in explicit use cases

## Intent

Clean Architecture distinguishes core domain rules from application-specific
workflow rules. The latter should live in explicit use case, interactor, or
application-service code that coordinates entities and ports, not in outer
delivery or persistence layers.

## Applicability

Applies when the diff introduces or materially changes business behavior in a
repository that presents explicit use cases, interactors, application services,
or equivalent workflow modules.

Return `unknown` when:

- the change is pure infrastructure or platform work,
- the repository does not expose a recognizable use-case layer, or
- the visible scope is too small to locate where the application rules belong.

## Strategy

`reasoning`

## What to inspect

1. Identify the main behavior or workflow changed by the diff.
2. Locate the code that sequences business steps, policy decisions, and
   coordination between collaborators.
3. Check whether that logic lives in a use case/interactor/application layer or
   has been absorbed by controllers, presenters, repositories, jobs, or ORM
   lifecycle hooks.

## Pass criteria

- Application-specific business rules are implemented in explicit use case,
  interactor, or application-service code.
- Delivery, persistence, and presentation layers stay thin and delegate inward
  to that application logic.

## Fail criteria

- Controllers, views, presenters, repositories, database mappers, framework
  callbacks, or transport handlers directly implement substantial business
  workflow or sequencing logic.
- A change to business behavior is accomplished mainly by spreading rule logic
  across outer adapters instead of concentrating it in an owning use case.

## Do not flag

- Thin routing, parsing, mapping, or formatting code at the edge.
- Straightforward gateway implementations whose job is only persistence or
  transport.
- Small scripts or utilities that do not claim a Clean Architecture split.

## Evidence to collect

- The changed workflow or business rule.
- The module currently owning that rule.
- The missing or bypassed use case/interactor boundary.

## Confidence guidance

- `HIGH`: business workflow logic is clearly implemented in an outer adapter.
- `MEDIUM`: a use case layer appears to exist, but some logic ownership is only
  inferred from surrounding code.
- `LOW`: prefer `unknown` when the repository does not show a stable workflow
  boundary.

## Remediation

- Extract or extend a use case/interactor/application-service module for the
  behavior.
- Keep controllers, presenters, and repositories focused on translation and IO.
- Let use cases coordinate entities and outward ports.
