---
id: test-018
title: Production code changes remain covered by commit-time automated test gates
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: book
    title: Accelerate + DORA reports
    chapter: Chapter 4 "Technical Practices"
    section: Continuous Integration and Continuous Testing
---

# test-018: Production code changes remain covered by commit-time automated test gates

## Intent
Production code should continue to pass through routine automated build and test gates before merge. Removing those gates weakens feedback and lets regressions reach later stages unnecessarily.

## Applicability
Applies when the diff changes CI workflows, presubmit rules, path filters, or repository test gating for production code. Return `unknown` when the change does not affect merge-time automation.

## What to inspect
Look at workflow triggers, path filters, required jobs, test targets, and whether production-code paths still execute automated validation before merge.

## Pass criteria
Production code changes still trigger routine automated build or test validation in the normal integration path.

## Fail criteria
The diff removes or bypasses commit-time automated test gating for production code, or narrows workflow filters so relevant production changes no longer run tests.

## Do not flag
Documentation-only path filters, duplication cleanup that preserves equivalent gating, or movement of the same required job under a renamed workflow.

## Confidence guidance
`HIGH` when required test jobs or path coverage are directly removed. `MEDIUM` when gating moves behind indirect workflow includes. `LOW` when required-status policy lives outside the repository.

## Remediation
Keep automated tests in the merge path for production code and restore path coverage for the affected components.

## Pass example
```yaml
on:
  pull_request:
    paths:
      - 'src/**'
jobs:
  test:
    steps:
      - run: npm test
```

## Fail example
```yaml
on:
  pull_request:
    paths:
      - 'docs/**'

# Production code under src/ no longer runs automated tests at commit time.
```
