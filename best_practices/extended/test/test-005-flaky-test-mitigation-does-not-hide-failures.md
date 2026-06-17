---
id: test-005
title: Flaky-test mitigation does not hide failures
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Flaky Tests at Google and How We Mitigate Them
    author: John Micco
    section: Current Mitigation Strategies
---

# test-005: Flaky-test mitigation does not hide failures

## Intent
Flaky-test mitigation should reduce noise without hiding real regressions or turning quarantined tests into forgotten dead zones.

## Applicability
Applies when the diff changes retry behavior, flaky-test annotations, quarantine lists, or test-suite gating rules. Return `unknown` when the changed code does not affect how test failures are surfaced or tracked.

## What to inspect
Check presubmit retry logic, flaky annotations, quarantine metadata, ownership fields, linked follow-up issues, and whether a first failing run still blocks the normal gate.

## Pass criteria
Blocking test paths still fail on first failure, and any quarantined flaky tests are explicitly labeled and linked to visible follow-up tracking.

## Fail criteria
The diff retries or suppresses presubmit failures until a test passes, or quietly removes a flaky test from the blocking path with no explicit tracking or owner.

## Do not flag
Local developer reruns, offline flake analytics, or platform-specific unsupported-environment skips that are not being used to hide a regression signal.

## Confidence guidance
`HIGH` when retry-until-pass logic or untracked quarantine is directly visible. `MEDIUM` when gating behavior is partly configured elsewhere. `LOW` when the annotation semantics are unclear.

## Remediation
Keep the first failing blocking result visible, and require explicit tracked quarantine metadata for temporarily removed flaky tests.

## Pass example
```yaml
quarantined_tests:
  - test: payments/test_retries.py::test_duplicate_charge
    issue: QA-418
    owner: payments-oncall
```

## Fail example
```yaml
retry_until_pass: true
ignore_failures:
  - payments/test_retries.py::test_duplicate_charge
```
