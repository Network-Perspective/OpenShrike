---
id: rel-python-ml-003
title: Automated actions are gated on model confidence or plausibility
domain: rel
language: python-ml
app-type: [any]
status: active
sources:
  - type: book
    title: Machine Learning Engineering
    author: Andriy Burkov
    chapter: "9.2.2 and 9.3.2"
---

# rel-python-ml-003: Automated actions are gated on model confidence or plausibility

## Intent
Prevent raw model mistakes from directly causing costly or unsafe automated side effects.

## Applicability
Applies when model outputs trigger money movement, user state changes, or other consequential automated actions.

## What to inspect
Confidence thresholds, plausibility checks, and human or manual fallback paths.

## Pass criteria
Consequential automated actions are gated by confidence or plausibility checks and have a fallback path when the prediction is uncertain.

## Fail criteria
The diff executes consequential actions directly from raw model output with no visible confidence or plausibility gate.

## Do not flag
Pure analytics, offline scoring, and advisory-only predictions.

## Confidence guidance
`HIGH` when the side effect and missing gate are directly visible. `MEDIUM` when confidence may be enforced elsewhere. `LOW` when action criticality is unclear.

## Remediation
Add thresholding, reasonableness checks, or human review before irreversible or sensitive automated actions.

## Pass example
```python
if score >= 0.95:
    approve()
```

## Fail example
```python
approve()
```
