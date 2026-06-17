---
id: data-005
title: Handle unseen categorical values safely at inference
domain: data
language: shared
app-type: [http-service, batch-job]
status: active
sources:
  - type: book
    title: Designing Machine Learning Systems
    author: Chip Huyen
    chapter: Chapter 5 "Encoding Categorical Features"
---

# data-005: Handle unseen categorical values safely at inference

## Intent
Prevent production failures or unstable predictions when new category values appear.

## Applicability
Applies to categorical feature encoding for serving or batch inference. Return `unknown` when encoding artifacts are external.

## What to inspect
Encoders, vocabulary files, fallback buckets, unknown-token handling, and inference preprocessing code.

## Pass criteria
The serving path handles unseen categories with an explicit unknown bucket, ignore mode, or equivalent safe fallback.

## Fail criteria
New values crash inference, raise key errors, or silently map to a real category with no deliberate fallback policy.

## Do not flag
Truly closed vocabularies enforced by upstream schema and business rules.

## Confidence guidance
`HIGH` when encoder configuration or lookup code clearly lacks unknown handling. `MEDIUM` when fallback may exist in another layer. `LOW` when category space ownership is unclear.

## Remediation
Add an unknown-category path and ensure training and serving artifacts agree on it.

## Pass example
```python
encoder = OneHotEncoder(handle_unknown="ignore")
```

## Fail example
```python
encoded = [vocab[value] for value in incoming_values]
```
