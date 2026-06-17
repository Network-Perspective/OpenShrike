---
id: test-017
title: Risky codepaths keep sanitizer and race-detector coverage
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Secure and Reliable Systems
    chapter: "Chapter 12"
    section: Sanitize Your Code
  - type: book
    title: Building Secure and Reliable Systems
    chapter: "Chapter 13"
    section: Dynamic Program Analysis
---

# test-017: Risky codepaths keep sanitizer and race-detector coverage

## Intent
Existing dynamic-analysis coverage for risky native or concurrent code should not be removed casually, because those tools often catch failures ordinary tests miss.

## Applicability
Applies when the diff changes sanitizer, race-detector, or comparable dynamic-analysis jobs for code that uses concurrency, native memory, unsafe operations, or similar high-risk behavior. Return `unknown` when the repository has no such tooling.

## What to inspect
Review CI jobs, test targets, build flags, and exclusions around dynamic-analysis coverage for risky codepaths.

## Pass criteria
Existing sanitizer or race-detector coverage for risky paths remains in place, or an equivalent replacement is introduced explicitly.

## Fail criteria
The diff disables, removes, or narrows existing sanitizer or race-detector coverage for risky codepaths without an equivalent replacement.

## Do not flag
Repositories with no such tooling, harmless renames that preserve coverage, or deliberate replacement with an equivalent stronger job.

## Confidence guidance
`HIGH` when a coverage job or target is plainly removed. `MEDIUM` when coverage narrowing is inferred from CI or build-config changes. `LOW` when the risk profile of the codepath is unclear.

## Remediation
Keep the existing dynamic-analysis coverage, or replace it with an equivalent path that still covers the risky code.

## Pass example
```yaml
jobs:
  race-tests:
    steps:
      - run: go test -race ./pkg/concurrent/...
```

## Fail example
```yaml
jobs:
  unit-tests:
    steps:
      - run: go test ./pkg/concurrent/...

# The prior -race coverage for this package was removed.
```
