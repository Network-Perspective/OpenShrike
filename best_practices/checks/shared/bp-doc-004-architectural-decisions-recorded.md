# BP-DOC-004: Architectural decisions are recorded

## Intent

Significant design changes should leave behind a durable explanation of why the
system now works the way it does. Without that record, teams relearn the same
tradeoffs and gradually diverge from intent.

## Applicability

Applies when the diff introduces a meaningful architectural decision, such as:

- a new service or deployable boundary,
- a major dependency or framework adoption,
- a storage model or consistency-model change,
- a new integration pattern,
- a security or operations tradeoff with lasting impact.

Return `unknown` when the change is too small to justify an ADR-level record.

## Strategy

`reasoning`

## What to inspect

1. Review whether the PR introduces an enduring design decision rather than a
   local code change.
2. Check for an ADR, design note, or equivalent update in repo docs.

## Pass criteria

- Significant architectural changes are accompanied by a durable record of the
  decision and tradeoffs, or
- the repository has an existing decision record that is clearly updated.

## Fail criteria

- A lasting architectural decision lands with no visible rationale record.

## Do not flag

- Routine refactors, bug fixes, or small feature work.
- Changes that clearly fall under an already documented architectural decision.

## Evidence to collect

- The architectural change.
- The absence of a corresponding design record.

## Confidence guidance

- `HIGH`: the PR clearly changes architecture and no record is present.
- `MEDIUM`: the change seems architectural, but documentation may live outside
  visible scope.
- `LOW`: prefer `unknown` when the impact is borderline.

## Remediation

- Add or update an ADR or equivalent design note describing the decision,
  alternatives, and consequences.
