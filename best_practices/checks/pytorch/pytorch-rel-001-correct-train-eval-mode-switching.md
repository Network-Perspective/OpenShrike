---
id: pytorch-rel-001
title: Training and evaluation use the correct module mode
domain: rel
language: pytorch
app-type: [any]
status: active
sources: []
---

# pytorch-rel-001: Training and evaluation use the correct module mode

## Intent
Keep dropout and batch-norm behavior correct across training and evaluation phases.

## Applicability
Applies to PyTorch training, validation, test, and inference loops.

## What to inspect
Phase boundaries and calls to `model.train()` or `model.eval()`.

## Pass criteria
Training uses `model.train()` and evaluation or inference uses `model.eval()`.

## Fail criteria
The diff runs validation or inference in training mode or resumes training without switching back.

## Do not flag
Models with no mode-sensitive layers when that is obvious and intentional.

## Confidence guidance
`HIGH` when the phase loop and missing switch are directly visible. `MEDIUM` when a helper likely owns mode changes. `LOW` when execution ownership is unclear.

## Remediation
Set the model mode explicitly at each phase boundary.

## Pass example
```python
model.eval()
```

## Fail example
```python
pred = model(x)
```
