---
id: test-003
title: Tests isolate mutable state and clean up created resources
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Google Testing Blog
  - type: article
    title: Made With ML
    author: Goku Mohandas
  - type: article
    title: goldbergyoni/nodebestpractices
  - type: article
    title: My Selenium Tests Aren't Stable!
    author: Simon Stewart
  - type: book
    title: "xUnit Test Patterns: Refactoring Test Code"
    author: Gerard Meszaros
---

# test-003: Tests isolate mutable state and clean up created resources

## Intent
Tests should not pass or fail based on leftover mutable state, fixed resource names, or artifacts left behind by earlier cases.

## Applicability
Applies when changed tests create files, directories, database rows, object-store objects, environment variables, accounts, caches, or other mutable shared resources. Return `unknown` when the relevant fixture lifecycle is outside visible scope.

## What to inspect
Check fixture scopes, temp paths, shared identifiers, teardown logic, singleton resets, and whether the changed tests allocate unique resources per test or per run.

## Pass criteria
Each test gets fresh mutable state or uses explicit reset and cleanup. Persistent artifacts, accounts, and paths are unique per test or run, and the teardown is visible or framework-managed.

## Fail criteria
Tests mutate shared state without resetting it, reuse fixed mutable resources across runs, or leak created artifacts into later tests.

## Do not flag
Immutable shared fixtures, read-only reference data, or framework-managed temp resources and rollback mechanisms that are clearly active.

## Confidence guidance
`HIGH` when the diff mutates shared state or fixed persistent resources without cleanup. `MEDIUM` when cleanup may happen through unseen hooks. `LOW` when the fixture lifetime is unclear.

## Remediation
Use per-test mutable state, unique resource names, and explicit cleanup or reset between tests.

## Pass example
```python
def test_exports_report(tmp_path):
    out = tmp_path / 'report.json'
    export_report(out)
    assert out.exists()
```

## Fail example
```python
SHARED_PATH = '/tmp/report.json'

def test_exports_report():
    export_report(SHARED_PATH)
    assert os.path.exists(SHARED_PATH)
```
