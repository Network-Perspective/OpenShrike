---
id: test-pytorch-001
title: Reproducible PyTorch paths seed every RNG they use
domain: test
language: pytorch
app-type: [any]
status: active
sources:
  - type: web
    title: "PyTorch official documentation: Reproducibility, torch.no_grad, eval semantics, and Performance Tuning Guide"
---

# test-pytorch-001: Reproducible PyTorch paths seed every RNG they use

## Intent
PyTorch training, evaluation, and regression-test paths that promise reproducibility need to seed every RNG they actually use.

## Applicability
Applies when changed PyTorch code uses randomness in a reproducibility-sensitive path such as training, evaluation, benchmarks, or regression tests. Return `unknown` when the path does not use RNGs or reproducibility is not part of its contract.

## What to inspect
Look for `torch`, `random`, and `numpy` RNG usage, shared seed helpers, and whether the changed path seeds all of the RNGs it consumes.

## Pass criteria
Every RNG used by the changed reproducibility-sensitive path is seeded consistently from an explicit seed.

## Fail criteria
The path uses multiple RNG sources but seeds only a subset of them, or seeds them inconsistently.

## Do not flag
Pure inference code with no stochastic operations, or code paths that clearly rely on a shared seeding helper outside the diff.

## Confidence guidance
`HIGH` when RNG calls and missing seeding are visible in the same path. `MEDIUM` when a shared seed helper is referenced but off-screen. `LOW` when the need for repeatability is unclear.

## Remediation
Seed each RNG used by the path from the same explicit seed value before stochastic work begins.

## Pass example
```python
SEED = 42
torch.manual_seed(SEED)
random.seed(SEED)
np.random.seed(SEED)
```

## Fail example
```python
torch.manual_seed(42)
weights = torch.randn(4, 4)
noise = np.random.normal(size=4)
shuffle = random.random()
```
