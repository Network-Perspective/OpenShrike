# JAVA-ARCH-002: Configuration properties are modeled and validated

## Intent

Configuration should be explicit and validated near startup. Stringly typed
property lookups buried in application code fail late and hide operational
requirements.

## Applicability

Applies when the diff introduces or changes application configuration beyond a
single bootstrap lookup.

Return `unknown` when the project is not using externalized configuration in a
structured way.

## Strategy

`heuristic`

## What to inspect

1. Review changed config access through `Environment`, `@Value`, or raw property
   lookups.
2. Check whether related settings are represented by validated configuration
   properties classes.

## Pass criteria

- Related settings are grouped in a dedicated config type.
- Required settings are validated at startup.

## Fail criteria

- Business logic repeatedly uses raw property lookups.
- Critical config is parsed ad hoc with no validation.

## Do not flag

- Small one-off bootstrap toggles.
- Tests intentionally overriding configuration.

## Evidence to collect

- The raw property access pattern.
- Missing validated configuration type.

## Confidence guidance

- `HIGH`: repeated raw config lookups are directly visible.
- `MEDIUM`: a central config class may exist elsewhere, but the new code bypasses it.
- `LOW`: prefer `unknown` if config ownership is unclear.

## Remediation

- Introduce a validated configuration properties class.
- Bind and validate config once near startup.
