---
id: test-pytorch-002
title: Deterministic CUDA paths disable cuDNN benchmarking
domain: test
language: pytorch
app-type: [any]
status: active
sources:
  - type: web
    title: PyTorch official docs, CUDA Convolution Benchmarking
---

# test-pytorch-002: Deterministic CUDA paths disable cuDNN benchmarking

## Intent
Supposedly deterministic CUDA runs should not leave cuDNN benchmarking enabled, because algorithm selection can vary with timing noise.

## Applicability
Applies when the diff adds or changes a CUDA setup path that is explicitly intended to be deterministic or reproducible. Return `unknown` when the path is CPU-only or clearly optimized only for throughput.

## What to inspect
Review CUDA setup helpers and assignments to `torch.backends.cudnn.benchmark` and related deterministic flags.

## Pass criteria
Deterministic or reproducibility-oriented CUDA paths explicitly set `torch.backends.cudnn.benchmark = False`.

## Fail criteria
A deterministic CUDA path leaves benchmarking enabled or explicitly sets it to `True`.

## Do not flag
Performance-only training code with no reproducibility contract, or CPU-only execution paths.

## Confidence guidance
`HIGH` when a named reproducibility path visibly enables benchmarking. `MEDIUM` when reproducibility intent is implied by surrounding flags. `LOW` when CUDA use is visible but reproducibility intent is not.

## Remediation
Set `torch.backends.cudnn.benchmark = False` anywhere the code is meant to produce repeatable CUDA results.

## Pass example
```python
torch.manual_seed(7)
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True
```

## Fail example
```python
torch.manual_seed(7)
torch.backends.cudnn.benchmark = True
torch.backends.cudnn.deterministic = True
```
