---
id: python-ml-002
title: Evaluation is separated from training data
domain: test
language: python-ml
app-type: [any]
status: active
sources:
  - type: article
    title: "The ML Test Score: A Rubric for ML Production Readiness"
    section: "2.1 Model Performance Tests"
  - type: article
    title: scikit-learn Common Pitfalls and Recommended Practices
    section: "12.2 Data Leakage"
---

# python-ml-002: Evaluation is separated from training data

## Intent
Training metrics are not deployment metrics. Model quality should be validated on held-out data or a comparably independent evaluation path, and held-out subsets should not be refit during evaluation.

## Applicability
Applies to training, benchmark, and promotion code that reports or relies on model performance. Return `unknown` when the diff does not touch evaluation, metric reporting, or promotion logic.

## What to inspect
Review how metrics are computed, whether promotion or selection uses a held-out split, and whether named validation or test subsets flow through `fit` or `fit_transform`.

## Pass criteria
Reported quality and promotion decisions are based on separated evaluation data or equivalent independent validation, and held-out subsets are used only for non-learning operations such as `transform`, `predict`, and scoring.

## Fail criteria
The code reports only training metrics as evidence of model quality, wires registration or promotion directly after train-only evaluation, or calls `fit` or `fit_transform` on held-out validation or test data.

## Do not flag
Intermediate debugging output when proper validation still exists, final retraining after evaluation is complete, or clearly different unsupervised evaluation setups.

## Confidence guidance
`HIGH` when only training data is used for reported quality, or held-out subsets visibly flow through fitting. `MEDIUM` when validation likely exists elsewhere but is not visible. `LOW` when the experiment flow is incomplete.

## Remediation
Add or preserve a held-out evaluation step, gate promotion on it, and keep learning operations off held-out subsets.

## Pass example
```python
X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=7)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_val_scaled = scaler.transform(X_val)
score = model.fit(X_train_scaled, y_train).score(X_val_scaled, y_val)
```

## Fail example
```python
X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=7)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_val_scaled = scaler.fit_transform(X_val)
registry.save_model(model.fit(X_train_scaled, y_train))
```
