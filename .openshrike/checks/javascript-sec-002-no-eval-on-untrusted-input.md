# JAVASCRIPT-SEC-002: Dynamic code evaluation is not fed by untrusted input

## Intent

`eval`, `new Function`, and equivalent dynamic execution paths collapse the
boundary between data and code. They are especially dangerous when content is
externally influenced.

## Applicability

Applies when the code dynamically evaluates JavaScript expressions, templates,
or generated functions.

Return `unknown` when the evaluated source is wrapped behind helpers out of
scope.

## Strategy

`static`

## What to inspect

1. Review `eval`, `new Function`, `vm`, and similar dynamic execution APIs.
2. Check whether externally influenced content reaches them.

## Pass criteria

- Dynamic execution is avoided on untrusted paths.
- If code generation exists, the source is fixed and repository-owned.

## Fail criteria

- User-controlled or external content reaches `eval`, `new Function`, or
  equivalent runtime code execution.

## Do not flag

- Build-time code generation outside runtime boundaries.
- Safe static lookup tables replacing dynamic evaluation.

## Evidence to collect

- The dynamic execution API usage.
- The external value reaching it.

## Confidence guidance

- `HIGH`: untrusted content reaches dynamic evaluation directly.
- `MEDIUM`: the source is likely external but some flow is out of scope.
- `LOW`: prefer `unknown` if the evaluated source is opaque.

## Remediation

- Replace dynamic execution with explicit dispatch or parsing.
- Keep untrusted data as data, not code.
