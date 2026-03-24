# PYTHON-SEC-003: Raw SQL remains parameterized

## Intent

SQL construction is an injection boundary. Python code should keep query text
and values separate whether it uses DB-API, SQLAlchemy, async drivers, or
micro-ORMs.

## Applicability

Applies when the diff builds raw SQL, text queries, or driver-level statements.

Return `unknown` when the final SQL generation is hidden behind a wrapper.

## Strategy

`static`

## What to inspect

1. Review raw SQL and query-building code.
2. Look for f-strings, `%` formatting, or concatenation with externally
   influenced values.

## Pass criteria

- Query values are passed separately through parameters/placeholders.
- Dynamic identifiers are chosen from allowlists rather than raw input.

## Fail criteria

- Externally influenced values are interpolated into SQL text.
- Raw query APIs are used with concatenated where/order fragments.

## Do not flag

- Constant maintenance SQL with no external input.
- ORM query builders that parameterize safely.

## Evidence to collect

- The SQL string.
- The untrusted value reaching it.

## Confidence guidance

- `HIGH`: direct SQL interpolation is visible.
- `MEDIUM`: dynamic query composition exists, but trust level is inferred.
- `LOW`: prefer `unknown` if final query rendering is not visible.

## Remediation

- Use driver or ORM parameter binding.
- Allowlist dynamic identifiers.
