# TYPESCRIPT-ARCH-002: Type suppression comments are narrow and justified

## Intent

`@ts-ignore` and broad suppression comments bypass the type system precisely at
the places where the code is telling reviewers something is unsafe. If a
suppression is unavoidable, it should be narrow and explained.

## Applicability

Applies when the diff adds `@ts-ignore`, `@ts-expect-error`, broad `eslint`
suppression around type safety, or equivalent bypasses.

Return `unknown` when the suppression reason is owned by generated code.

## Strategy

`static`

## What to inspect

1. Review new or changed suppression comments.
2. Check whether the suppression is scoped to one line and whether a concrete
   reason is given.

## Pass criteria

- Suppressions are rare, tightly scoped, and justified with a concrete reason.
- `@ts-expect-error` is preferred over silent ignores when the error is
  intentional and temporary.

## Fail criteria

- The diff adds broad or unexplained suppression of type errors.
- A suppression hides a real boundary mismatch instead of fixing it.

## Do not flag

- Generated code.
- Temporary compatibility shims that are clearly labeled and narrowly scoped.

## Evidence to collect

- The suppression comment.
- The code it hides.

## Confidence guidance

- `HIGH`: unexplained or broad suppression is directly visible.
- `MEDIUM`: the reason may exist elsewhere in PR context but not in code.
- `LOW`: prefer `unknown` for generated or externally owned code.

## Remediation

- Fix the type mismatch directly when possible.
- If suppression is necessary, scope it narrowly and document the reason.
