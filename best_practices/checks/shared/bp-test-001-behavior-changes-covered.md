# BP-TEST-001: Behavior changes are protected by automated tests

## Intent

If a change modifies observable behavior, there should be automated evidence
that the new behavior is intentional and will not regress silently.

## Applicability

Applies when the diff changes business logic, control flow, validation,
serialization, persistence semantics, authorization, concurrency, or a public
contract.

Return `unknown` when the change is clearly non-behavioral or when existing test
coverage may exist outside visible scope.

## Strategy

`reasoning`

## What to inspect

1. Review production changes for altered behavior.
2. Look for added or updated tests in the same diff.
3. If no tests changed, check whether nearby tests obviously already cover the
   changed behavior.

## Pass criteria

- The diff adds or updates tests that exercise the changed behavior, or
- existing tests clearly already cover it.

## Fail criteria

- A behavior change lands with no matching automated test evidence.
- A bug fix lacks a regression test.

## Do not flag

- Pure refactors.
- Rename, comment, formatting, or generated-code changes.
- Trivial bootstrap changes already covered by startup validation.

## Evidence to collect

- The behavior-changing code.
- The absence of corresponding automated test evidence.

## Confidence guidance

- `HIGH`: the behavior change is obvious and no relevant tests changed.
- `MEDIUM`: behavior changed, but some coverage may exist outside scope.
- `LOW`: prefer `unknown` if the change could be mechanical.

## Remediation

- Add or update tests that cover the changed behavior.
- Add a regression test for bug fixes.
