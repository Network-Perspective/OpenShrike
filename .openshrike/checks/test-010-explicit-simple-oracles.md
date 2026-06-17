---
id: test-010
title: Tests verify outcomes with explicit, simple oracles
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
    chapter: Ch. 12 "Avoid Logic in Tests"; Ch. 13 "DAMP vs. DRY for Tests"
  - type: book
    title: "Unit Testing: Principles, Practices, and Patterns"
    author: Vladimir Khorikov
    chapter: Ch. 11.3 "Leaking domain knowledge to tests"
  - type: book
    title: "xUnit Test Patterns: Refactoring Test Code"
    author: Gerard Meszaros
    section: Eager Test (Anti-Pattern)
---

# test-010: Tests verify outcomes with explicit, simple oracles

## Intent
Tests should verify a meaningful result with an oracle simpler than the production logic. Tests that merely execute code or recreate the implementation logic provide weak protection.

## Applicability
Applies when the diff adds or changes executable tests for production behavior. Return `unknown` when the test's whole purpose is an explicitly asserted startup-success or exception contract.

## What to inspect
Look for tests with no meaningful assertion, tests that only verify fixture setup, or expectations computed by duplicating the production algorithm.

## Pass criteria
The test verifies an explicit outcome, and its expected result comes from fixed values, fixtures, snapshots, tables, or an independent oracle simpler than the implementation.

## Fail criteria
The test only executes code with no real verification, or computes the expected answer by mirroring the production algorithm.

## Do not flag
Expected-exception tests, snapshot or golden-file assertions, or property tests whose invariant is simpler and more general than the implementation.

## Confidence guidance
`HIGH` when the test has no meaningful assertion or line-by-line mirrors the implementation logic. `MEDIUM` when verification may be hidden in helpers. `LOW` when the oracle may be independent but the helper is out of scope.

## Remediation
Add an explicit outcome assertion and use fixed expected values or another independent oracle.

## Pass example
```python
@pytest.mark.parametrize('a,b,expected', [(1, 3, 4), (11, 33, 44)])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

## Fail example
```python
def test_add(a, b):
    expected = a + b
    assert add(a, b) == expected
```
