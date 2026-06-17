---
id: python-ml-001
title: Prevent leakage in Python ML splitting and preprocessing
domain: data
language: python-ml
app-type: [any]
status: active
sources:
  - type: book
    title: Machine Learning Engineering
    author: Andriy Burkov
  - type: article
    title: Common pitfalls and recommended practices
---

# python-ml-001: Prevent leakage in Python ML splitting and preprocessing

## Intent
Prevent target, time, group, and preprocessing leakage in Python ML workflows so evaluation stays trustworthy.

## Applicability
Applies to scikit-learn and similar Python training code, notebooks, and pipelines. Return `unknown` when splitting and transform fitting happen entirely outside the diff.

## What to inspect
`train_test_split`, `GroupKFold`, time-based splits, `Pipeline` or `ColumnTransformer`, target-derived features, augmentation, imputers, scalers, encoders, and feature selectors.

## Pass criteria
Code splits before fitting learned transforms, uses grouped or chronological splits where the data demands it, keeps augmentation and resampling on training data only, and packages preprocessing with the estimator so serving and evaluation use the same fitted path.

## Fail criteria
Transformers or selectors fit on all rows before splitting, holdout examples are augmented or oversampled, grouped entities cross partitions, future-only features are present, or inference manually reimplements training transforms.

## Do not flag
Pure rule-based feature extraction, stateless text cleanup, or visible shared training utilities that already enforce correct split-fit order.

## Confidence guidance
`HIGH` when `.fit()` or `fit_transform()` touches all data before the split or when grouped or time-aware splitting is clearly missing. `MEDIUM` when a helper may wrap the correct pipeline. `LOW` when only config is visible.

## Remediation
Move split logic ahead of any learned preprocessing, wrap preprocessing and model steps in one fitted pipeline, and use group-aware or time-aware split APIs when the data is correlated.

## Pass example
```python
X_train, X_test, y_train, y_test = train_test_split(X, y, shuffle=False)
model = make_pipeline(StandardScaler(), LogisticRegression())
model.fit(X_train, y_train)
```

## Fail example
```python
X_all = StandardScaler().fit_transform(X)
selected = SelectKBest(k=20).fit_transform(X_all, y)
X_train, X_test, y_train, y_test = train_test_split(selected, y)
```
