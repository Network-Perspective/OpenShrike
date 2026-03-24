# JAVA-ARCH-001: Runtime dependencies are explicit through constructors

## Intent

Field injection hides required collaborators and makes objects harder to test
and reason about. Constructor injection keeps runtime requirements explicit.

## Applicability

Applies to DI-managed Java applications, especially Spring and Jakarta-based
services.

Return `unknown` when the code is not container-managed or the injection model
is not visible.

## Strategy

`static`

## What to inspect

1. Review changed service, controller, handler, and component classes.
2. Look for `@Autowired` field injection or mutable setter injection for
   required dependencies.

## Pass criteria

- Required dependencies are supplied through constructors.
- Fields representing dependencies are final where practical.

## Fail criteria

- New required collaborators are injected through fields or broad setter
  injection.

## Do not flag

- Framework-managed optional setters with a clear reason.
- Test fixtures.

## Evidence to collect

- The injected field or setter.
- The hidden dependency it represents.

## Confidence guidance

- `HIGH`: field injection of required dependencies is directly visible.
- `MEDIUM`: setter injection looks required but optionality is partly inferred.
- `LOW`: prefer `unknown` if container ownership is unclear.

## Remediation

- Convert required dependencies to constructor injection.
- Keep dependency requirements explicit and immutable.
