# PYTHON-ARCH-002: Configuration is centralized and validated

## Intent

Configuration should be loaded once, modeled explicitly, and validated close to
startup. Scattered `os.environ[...]` lookups and stringly typed settings hide
runtime requirements and fail late.

## Applicability

Applies when the diff introduces or changes application configuration beyond a
one-off lookup in bootstrap code.

Return `unknown` when the code is a tiny script or the configuration surface is
not visible.

## Strategy

`heuristic`

## What to inspect

1. Look for repeated `os.getenv`, `os.environ`, dotenv, or config-dict lookups
   inside application logic.
2. Check whether settings are modeled in one place with validation.

## Pass criteria

- Related settings are loaded through a centralized settings object or module.
- Required values are validated at startup, not deep inside business logic.

## Fail criteria

- Business logic repeatedly reads raw environment variables.
- Critical settings are parsed ad hoc with no validation.

## Do not flag

- A single bootstrap lookup for a simple toggle.
- Tests overriding environment variables deliberately.

## Evidence to collect

- Repeated raw settings lookups.
- Missing validation or central settings model.

## Confidence guidance

- `HIGH`: repeated raw environment access in business code is directly visible.
- `MEDIUM`: a central settings layer may exist elsewhere, but is not used here.
- `LOW`: prefer `unknown` if the changed code only brushes against config.

## Remediation

- Introduce a validated settings object.
- Bind environment/config once at startup and inject or import the typed
  settings boundary.
