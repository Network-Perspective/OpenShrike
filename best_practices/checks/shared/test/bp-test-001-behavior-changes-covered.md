---
id: bp-test-001
title: Behavior changes are protected by automated tests
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Google Engineering Practices - Code Review Developer Guide
  - type: book
    title: "Looks Good to Me: Constructive Code Reviews"
    author: Adrienne Braganza
  - type: article
    title: Code Review Research & Blog
    author: Michaela Greiler
  - type: article
    title: Modern Code Review Research - Google & Microsoft Studies
  - type: article
    title: Made With ML
    author: Goku Mohandas
  - type: book
    title: "Refactoring Databases: Evolutionary Database Design"
  - type: book
    title: Working Effectively with Legacy Code
    author: Michael Feathers
---

# bp-test-001: Behavior changes are protected by automated tests

## Intent
If a change modifies observable behavior, there should be automated evidence that the new behavior is intentional and will not regress silently.

## Applicability
Applies when the diff changes business logic, control flow, validation, serialization, persistence semantics, authorization, concurrency, public behavior, database behavior, or a bug-triggering edge case. Return `unknown` when the change is clearly non-behavioral or when existing coverage may exist outside visible scope.

## What to inspect
Review production changes for altered behavior, then look for added or updated tests in the same diff or nearby existing tests that clearly exercise the changed path.

## Pass criteria
The diff adds or updates tests that exercise the changed behavior, or nearby existing tests clearly already cover it. Bug fixes add a regression test. Legacy behavior changes first pin down relied-on behavior when the current contract is otherwise unclear.

## Fail criteria
An observable behavior change lands with no matching automated test evidence, or a bug fix ships without a regression test.

## Do not flag
Pure refactors, renames, comments, formatting-only edits, generated code, or trivial wiring changes already clearly covered by startup validation.

## Confidence guidance
`HIGH` when the behavior change is obvious and no relevant automated evidence changed. `MEDIUM` when behavior changed but some coverage may exist outside scope. `LOW` when the change could still be mechanical.

## Remediation
Add or update tests that cover the changed behavior. For bug fixes, add a regression test that fails before the fix.

## Pass example
```python
def normalize_status(raw: str) -> str:
    return "closed" if raw in {"done", "resolved"} else raw


def test_normalize_status_maps_resolved_to_closed():
    assert normalize_status("resolved") == "closed"
```

## Fail example
```python
def normalize_status(raw: str) -> str:
    return "closed" if raw in {"done", "resolved"} else raw

# The diff changes shipped behavior but adds no test coverage.
```
