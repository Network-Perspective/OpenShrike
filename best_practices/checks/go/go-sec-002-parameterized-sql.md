# GO-SEC-002: SQL remains parameterized

## Intent

Raw SQL construction is an injection boundary. Go code should keep query text
and values separate whether it uses `database/sql`, sqlx, GORM raw SQL, pgx, or
other drivers.

## Applicability

Applies when the diff introduces or changes raw SQL or query fragments.

Return `unknown` when the final query rendering is hidden behind helpers.

## Strategy

`static`

## What to inspect

1. Review SQL strings and driver calls.
2. Look for `fmt.Sprintf`, concatenation, or externally influenced fragments in
   query text.

## Pass criteria

- Values are passed through placeholders and args.
- Dynamic identifiers are chosen from allowlists.

## Fail criteria

- Externally influenced values are interpolated into SQL strings.
- Raw query helpers accept concatenated where/order fragments from input.

## Do not flag

- Constant migration SQL.
- ORM-generated parameterized queries.

## Evidence to collect

- The SQL string.
- The value reaching it.

## Confidence guidance

- `HIGH`: direct SQL interpolation is visible.
- `MEDIUM`: dynamic query composition exists, but trust level is inferred.
- `LOW`: prefer `unknown` if final query generation is hidden.

## Remediation

- Use placeholders and args.
- Allowlist dynamic identifiers.
