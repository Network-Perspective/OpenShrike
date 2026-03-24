# JAVA-SEC-003: SQL remains parameterized

## Intent

Raw SQL construction is an injection boundary. Java code should keep query text
and values separate whether it uses JDBC, JPA native queries, jOOQ, or other
data access layers.

## Applicability

Applies when the diff introduces or changes raw SQL or native query paths.

Return `unknown` when the final query renderer is hidden behind abstractions.

## Strategy

`static`

## What to inspect

1. Review changed SQL strings and native query APIs.
2. Look for string concatenation or interpolation from external values.

## Pass criteria

- Values are bound through parameters/placeholders.
- Dynamic identifiers come from allowlists.

## Fail criteria

- External values are concatenated into SQL text.
- Native query APIs are used with untrusted fragments and no parameter binding.

## Do not flag

- Constant administrative SQL with no external input.
- ORM query builders that parameterize safely.

## Evidence to collect

- The SQL text.
- The external value reaching it.

## Confidence guidance

- `HIGH`: direct SQL concatenation is visible.
- `MEDIUM`: dynamic query composition exists, but trust level is inferred.
- `LOW`: prefer `unknown` if final query rendering is hidden.

## Remediation

- Bind parameters instead of concatenating values.
- Allowlist dynamic identifiers.
