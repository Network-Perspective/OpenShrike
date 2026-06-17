---
id: pytorch-ops-001
title: Checkpoints store portable state rather than whole model objects
domain: ops
language: pytorch
app-type: [any]
status: active
sources: []
---

# pytorch-ops-001: Checkpoints store portable state rather than whole model objects

## Intent
Saving whole Python objects couples artifacts to exact code layout and pickling semantics. Portable checkpoints should store `state_dict` and explicit metadata instead.

## Applicability
Applies to PyTorch training and model export code that writes checkpoints.

## What to inspect
Checkpoint serialization code and whether it saves `model.state_dict()` or whole model objects.

## Pass criteria
Checkpoints persist `state_dict` plus required metadata and optimizer state when needed.

## Fail criteria
Routine checkpoints or release artifacts serialize the whole model object.

## Do not flag
TorchScript or ONNX exports with explicit intent, or clearly throwaway research experiments.

## Confidence guidance
`HIGH` when `torch.save(model, ...)` is directly visible. `MEDIUM` when a helper likely does whole-object serialization. `LOW` when artifact format is hidden.

## Remediation
Save `state_dict` plus explicit metadata instead of serializing the whole model object.

## Pass example
```python
torch.save({"model": model.state_dict(), "epoch": epoch}, path)
```

## Fail example
```python
torch.save(model, path)
```
