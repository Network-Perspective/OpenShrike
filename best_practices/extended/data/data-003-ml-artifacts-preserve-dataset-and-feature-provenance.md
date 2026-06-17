---
id: data-003
title: Preserve dataset lineage and feature provenance for production ML artifacts
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Machine Learning Systems
    author: Chip Huyen
  - type: article
    title: Hidden Technical Debt in Machine Learning Systems
  - type: article
    title: "The ML Test Score: A Rubric for ML Production Readiness"
  - type: article
    title: MLflow documentation on experiment tracking and dataset management
---

# data-003: Preserve dataset lineage and feature provenance for production ML artifacts

## Intent
Keep production ML artifacts traceable back to the exact datasets and feature definitions that produced them.

## Applicability
Applies to training jobs, experiment tracking, feature registration, and model publication. Return `unknown` when artifact tracking is fully external.

## What to inspect
Run metadata, dataset source identifiers, snapshot references, feature definition registries, and artifact manifests.

## Pass criteria
Training artifacts record the dataset source or snapshot and the feature definitions or lineage needed to reproduce the run.

## Fail criteria
Published or promoted artifacts lack dataset origin, feature provenance, or enough metadata to trace regressions back to source data.

## Do not flag
Ephemeral exploratory notebooks that do not produce shared or production ML artifacts.

## Confidence guidance
`HIGH` when artifact metadata visibly omits dataset or feature lineage. `MEDIUM` when a tracking system may capture it elsewhere. `LOW` when only model code changed.

## Remediation
Attach dataset identifiers, source locations, version or snapshot info, and feature lineage to tracked runs and promoted artifacts.

## Pass example
```python
mlflow.log_input(dataset, context="training")
mlflow.set_tag("feature_set", "user_risk_v3")
```

## Fail example
```python
mlflow.sklearn.log_model(model, "model")
```
