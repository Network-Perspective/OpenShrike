---
id: test-004
title: Resource-dependent tests are explicitly gated outside default runs
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Made With ML
    author: Goku Mohandas
---

# test-004: Resource-dependent tests are explicitly gated outside default runs

## Intent
Default test runs should not fail nondeterministically because a test silently assumes GPUs, large datasets, unusual hardware, or other special execution environments.

## Applicability
Applies when changed tests require special hardware, large external datasets, unusually long runtimes, or environment-specific resources not present in routine developer and CI runs. Return `unknown` when the suite classification is not visible.

## What to inspect
Check test markers, skip logic, suite configuration, resource assumptions, and whether the changed tests are excluded from the default path unless the required environment is present.

## Pass criteria
Resource-dependent tests are clearly marked, skipped, or isolated into a non-default suite with explicit environment requirements.

## Fail criteria
Default test runs unconditionally require special hardware, large datasets, or similarly scarce resources.

## Do not flag
Fast CPU-only tests, small repo-local fixtures, or specialized suites already isolated outside normal PR validation.

## Confidence guidance
`HIGH` when the test directly assumes a missing special resource with no guard. `MEDIUM` when suite wiring is partly hidden. `LOW` when default-path membership is unclear.

## Remediation
Add explicit markers or skip guards and move the test behind a dedicated opt-in gate.

## Pass example
```python
@pytest.mark.gpu
def test_trains_on_cuda():
    if not torch.cuda.is_available():
        pytest.skip('CUDA required')
    train_on_gpu()
```

## Fail example
```python
def test_trains_on_cuda():
    train_on_gpu()
```
