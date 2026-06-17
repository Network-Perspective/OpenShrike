---
id: pytorch-rel-003
title: Device placement is explicit and consistent
domain: rel
language: pytorch
app-type: [any]
status: active
sources: []
---

# pytorch-rel-003: Device placement is explicit and consistent

## Intent
Avoid runtime failures and hidden performance problems from mixed CPU and GPU placement.

## Applicability
Applies to PyTorch code that uses accelerators or moves tensors between devices.

## What to inspect
Device selection, model placement, batch placement, and forward-pass boundaries.

## Pass criteria
The model and all relevant tensors are moved to the same explicit device.

## Fail criteria
The diff mixes CPU and GPU tensors implicitly or leaves device handling ambiguous across phases.

## Do not flag
Clearly CPU-only code.

## Confidence guidance
`HIGH` when inconsistent placement is directly visible. `MEDIUM` when helper code may own movement. `LOW` when accelerator usage is unclear.

## Remediation
Select the device explicitly and move both model and tensors consistently.

## Pass example
```python
model = model.to(device)
batch = batch.to(device)
```

## Fail example
```python
model = model.cuda()
pred = model(cpu_batch)
```
