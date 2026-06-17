---
id: doc-002
title: Public and operator-facing docs stay in sync with behavior changes
domain: doc
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Diataxis framework
  - type: article
    title: Google Engineering Practices - Code Review Developer Guide
  - type: book
    title: "Looks Good to Me: Constructive Code Reviews"
    author: Adrienne Braganza
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
---

# doc-002: Public and operator-facing docs stay in sync with behavior changes

## Intent
Prevent shipped behavior from diverging from the repository's own instructions,
reference material, and runbooks. Missing docs turn valid code changes into
integration mistakes, operational mistakes, and support burden.

## Applicability
Applies when the diff changes a documented public contract, CLI, configuration
surface, setup flow, build or test workflow, release or deprecation path, or
other user-facing or operator-facing behavior, and the repository contains docs
for that surface.

Return `unknown` if the change is internal-only or the repository has no
maintained docs for the affected surface.

## What to inspect
Changed public interfaces, commands, config keys, workflows, runbooks, and the
README, docs pages, examples, or operational guides that describe those paths.

## Pass criteria
- Relevant reference docs, examples, README sections, or operational docs are
  added or updated to match the changed behavior or workflow.
- Or the old documentation remains accurate because the old contract still
  works unchanged.

## Fail criteria
- The diff changes a documented public or operational behavior, but no
  corresponding documentation update appears in the repository.
- The diff updates docs, but the updated docs still describe removed names,
  old flags, or obsolete workflow steps.

## Do not flag
- Internal refactors with unchanged behavior.
- Hidden feature scaffolding that is not yet exposed.
- Test-only helpers.
- Repositories that intentionally keep the authoritative docs outside the
  codebase.

## Confidence guidance
- `HIGH`: the changed behavior is documented nearby and those docs are clearly
  stale.
- `MEDIUM`: public or operator impact is evident but the exact doc location is
  inferred.
- `LOW`: it is unclear whether consumers rely on repository-hosted docs.

## Remediation
- Update the relevant repository documentation in the same PR so it matches the
  shipped behavior and workflow.

## Pass example
```markdown
## Development

Run `make verify` before pushing. It now runs lint, tests, and schema checks.
```

## Fail example
```make
verify:
	./scripts/lint
	./scripts/test
	./scripts/check-schema
```
