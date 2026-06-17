---
id: pytorch-rel-002
title: Evaluation and inference disable gradient tracking
domain: rel
language: pytorch
app-type: [any]
status: active
sources: []
---

# pytorch-rel-002: Evaluation and inference disable gradient tracking

## Intent
Avoid unnecessary memory and compute overhead during evaluation and inference.

## Applicability
Applies to PyTorch validation, test, and inference code.

## What to inspect
Forward passes and whether they run under `torch.no_grad()` or `torch.inference_mode()`.

## Pass criteria
Non-training forward passes disable gradient tracking.

## Fail criteria
The diff adds evaluation or inference forward passes with gradients still enabled.

## Do not flag
Training code and explicit gradient-based attribution flows.

## Confidence guidance
`HIGH` when the missing guard is directly visible. `MEDIUM` when a helper may own it. `LOW` when execution ownership is unclear.

## Remediation
Wrap non-training forward passes in `torch.no_grad()` or `torch.inference_mode()`.

## Pass example
```python
with torch.no_grad():
    pred = model(x)
```

## Fail example
```python
pred = model(x)
```
