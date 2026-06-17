---
id: test-python-ml-002
title: Reused shuffled scikit-learn CV splitters use integer seeds
domain: test
language: python-ml
app-type: [any]
status: active
sources:
  - type: article
    title: "scikit-learn docs: Common pitfalls and recommended practices"
---

# test-python-ml-002: Reused shuffled scikit-learn CV splitters use integer seeds

## Intent
Fair model comparison requires reused shuffled cross-validation splitters to produce the same folds across repeated evaluations.

## Applicability
Applies when the diff creates a shuffled scikit-learn splitter and reuses it across multiple evaluation calls. Return `unknown` when the splitter is used only once or `shuffle=False`.

## What to inspect
Check `KFold`, `StratifiedKFold`, `ShuffleSplit`, `shuffle=True`, the `random_state` value, and whether the same splitter object is reused across multiple evaluations.

## Pass criteria
A reused shuffled splitter is seeded with an integer so repeated evaluations use the same folds.

## Fail criteria
The diff reuses a shuffled splitter backed by a mutable RNG object, causing successive evaluations to consume different folds.

## Do not flag
One-off evaluation calls, splitters with `shuffle=False`, or intentionally varying repeated-CV experiments that construct fresh splitters explicitly.

## Confidence guidance
`HIGH` when the same splitter variable is visibly reused across multiple evaluations. `MEDIUM` when reuse is inferred through helpers. `LOW` when reuse is unclear.

## Remediation
Use an integer `random_state` for reused shuffled splitters.

## Pass example
```python
cv = KFold(n_splits=5, shuffle=True, random_state=42)
lda_scores = cross_val_score(lda, X, y, cv=cv)
nb_scores = cross_val_score(nb, X, y, cv=cv)
```

## Fail example
```python
rng = np.random.RandomState(0)
cv = KFold(n_splits=5, shuffle=True, random_state=rng)
lda_scores = cross_val_score(lda, X, y, cv=cv)
nb_scores = cross_val_score(nb, X, y, cv=cv)
```
