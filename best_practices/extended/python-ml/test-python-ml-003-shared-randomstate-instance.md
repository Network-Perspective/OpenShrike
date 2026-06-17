---
id: test-python-ml-003
title: scikit-learn estimators do not share one mutable RandomState instance
domain: test
language: python-ml
app-type: [library]
status: active
sources:
  - type: article
    title: Common pitfalls and recommended practices
---

# test-python-ml-003: scikit-learn estimators do not share one mutable RandomState instance

## Intent
Sharing one mutable RNG object across estimators or clones creates order-dependent training behavior that is hard to reproduce or compare.

## Applicability
Applies when the diff passes `RandomState` objects into multiple scikit-learn estimators or clones. Return `unknown` when no reusable RNG object is involved.

## What to inspect
Look for `np.random.RandomState(...)` objects, estimator construction, cloning, and whether the same RNG object is reused across models.

## Pass criteria
Each estimator uses an integer seed or another isolated RNG configuration that does not share mutable state across models.

## Fail criteria
The diff passes one mutable `RandomState` instance into multiple estimators or clones whose behavior is expected to be compared independently.

## Do not flag
One-off local experiments, fresh RNG instances per estimator, or integer seeds reused intentionally.

## Confidence guidance
`HIGH` when the same `RandomState` object is visibly passed to multiple estimators. `MEDIUM` when helper code hides part of the estimator construction. `LOW` when reuse is uncertain.

## Remediation
Use integer seeds or separate RNG objects so estimator behavior is not coupled by shared mutable state.

## Pass example
```python
rf = RandomForestClassifier(random_state=7)
gb = GradientBoostingClassifier(random_state=7)
```

## Fail example
```python
rng = np.random.RandomState(7)
rf = RandomForestClassifier(random_state=rng)
gb = GradientBoostingClassifier(random_state=rng)
```
