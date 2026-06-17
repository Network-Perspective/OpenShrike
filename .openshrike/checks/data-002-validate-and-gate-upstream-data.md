---
id: data-002
title: Validate and gate upstream data before downstream training or pipeline work
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Made With ML
  - type: article
    title: ML Test Score Rubric
  - type: documentation
    title: MLflow Documentation on Experiment Tracking and Dataset Management
  - type: book
    title: "The Site Reliability Workbook: Practical Ways to Implement SRE"
  - type: article
    title: Hidden Technical Debt in Machine Learning Systems
---

# data-002: Validate and gate upstream data before downstream training or pipeline work

## Intent
Stop bad upstream data before it contaminates training, feature pipelines, or tracked experiments.

## Applicability
Applies to ingestion, feature building, dataset preparation, training starts, and pipeline stage transitions. Return `unknown` when readiness checks are managed outside the repo.

## What to inspect
Schema validators, required-field checks, allowed-value checks, duplicate detection, dataset readiness gates, and pipeline control flow after failed checks.

## Pass criteria
Upstream data is checked for required structure and quality, failures stop downstream work, and training or pipeline stages do not proceed on known-bad inputs.

## Fail criteria
Malformed, duplicate, null-critical, or unknown-labeled data is allowed through, or quality failures are only logged while later stages continue.

## Do not flag
Best-effort warning metrics that supplement, rather than replace, a blocking gate on required data guarantees.

## Confidence guidance
`HIGH` when validation failures clearly do not block execution. `MEDIUM` when gating may happen in orchestration code outside the diff. `LOW` when only schema definitions are visible.

## Remediation
Validate required schema and quality rules at ingestion boundaries and make failed checks block training or downstream stages.

## Pass example
```python
report = validate_dataset(df)
if not report.ok:
    raise RuntimeError(report.summary)
```

## Fail example
```python
validate_dataset(df)
train_model(df)
```
