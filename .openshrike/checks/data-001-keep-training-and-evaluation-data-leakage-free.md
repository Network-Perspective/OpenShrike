---
id: data-001
title: Keep training and evaluation data leakage-free
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Machine Learning Systems
    author: Chip Huyen
    chapter: Chapter 4 "Handling Class Imbalance"; Chapter 5 "Data Leakage"
---

# data-001: Keep training and evaluation data leakage-free

## Intent
Keep holdout data meaningfully unseen so offline metrics reflect real generalization.

## Applicability
Applies to training, validation, test, and evaluation dataset construction, including split logic and learned preprocessing. Return `unknown` when only final artifacts are visible.

## What to inspect
Changed split code, deduplication, resampling, entity grouping, time partitioning, learned transforms, and feature selection inputs.

## Pass criteria
Splits are formed before fit-time statistics or learned transforms, duplicates and correlated entities stay within one partition, time-ordered data is split chronologically, and training-only operations stay out of validation or test paths.

## Fail criteria
Holdout data influences preprocessing or feature selection, duplicates or linked entities cross partitions, future data enters training, or unique row identifiers are used as predictive features.

## Do not flag
Purely static feature logic, fixed rule-based transforms with no learned state, or synthetic toy examples not used for evaluation.

## Confidence guidance
`HIGH` when split-before-fit order or entity leakage is directly visible. `MEDIUM` when hidden helpers may own split logic. `LOW` when only dataset names are visible.

## Remediation
Split first, fit only on training data, keep related examples together, use time-aware partitions where needed, and remove leakage-prone identifiers.

## Pass example
```python
train, test = df[df.ts < cutoff], df[df.ts >= cutoff]
X_train, y_train = train[features], train[target]
X_test, y_test = test[features], test[target]
```

## Fail example
```python
scaler.fit(df[features])
X_train, X_test = train_test_split(scaler.transform(df[features]))
```
