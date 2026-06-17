---
id: python-ml-003
title: Training and serving share the same preprocessing contract
domain: rel
language: python-ml
app-type: [any]
status: active
sources:
  - type: book
    title: Machine Learning Engineering
    author: Andriy Burkov
---

# python-ml-003: Training and serving share the same preprocessing contract

## Intent
Prevent training-serving skew by keeping feature extraction, preprocessing artifacts, and their versions aligned.

## Applicability
Applies to repos that both train and serve models or export preprocessing artifacts for later inference.

## What to inspect
Training feature transforms, serving transforms, persisted preprocessor artifacts, and version linkage between model and feature code.

## Pass criteria
Training and serving use the same persisted transformer or shared feature code and version-compatible artifacts.

## Fail criteria
The diff reimplements serving preprocessing independently or allows model, extractor, and data versions to drift.

## Do not flag
Research-only code with no serving path.

## Confidence guidance
`HIGH` when train and serve preprocessing visibly diverge. `MEDIUM` when one side is partly out of scope. `LOW` when the boundary is unclear.

## Remediation
Persist and reuse the trained transformer or share one feature pipeline and version the artifacts together.

## Pass example
```python
features = preprocessor.transform(df)
model = load_model(bundle.model_version)
```

## Fail example
```python
features = manual_serving_feature_builder(request_json)
```
