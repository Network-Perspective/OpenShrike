---
id: test-pytorch-003
title: Reproducible multi-worker DataLoaders seed worker processes
domain: test
language: pytorch
app-type: [any]
status: active
sources:
  - type: web
    title: "PyTorch official documentation: Reproducibility, torch.no_grad, eval semantics, and Performance Tuning Guide"
---

# test-pytorch-003: Reproducible multi-worker DataLoaders seed worker processes

## Intent
Multi-worker PyTorch data loading should not undermine reproducibility by leaving per-worker RNG state uncontrolled.

## Applicability
Applies when the diff adds or changes a PyTorch `DataLoader` with `num_workers > 0` in a reproducibility-sensitive path. Return `unknown` when the loader is single-worker or reproducibility is not part of the path's contract.

## What to inspect
Review `DataLoader` construction, `num_workers`, `worker_init_fn`, `generator`, and any seed helpers used in the training or evaluation path.

## Pass criteria
The loader provides a seeded `torch.Generator` and a `worker_init_fn` that seeds the RNGs used inside worker processes.

## Fail criteria
The changed multi-worker reproducibility-sensitive loader omits `worker_init_fn`, omits a seeded `generator`, or otherwise leaves worker RNG state uncontrolled.

## Do not flag
Single-worker loaders, exploratory notebooks, or loaders built through an unchanged factory that already handles worker seeding.

## Confidence guidance
`HIGH` when the `DataLoader` call directly includes or omits the seeding hooks. `MEDIUM` when those hooks are supplied indirectly. `LOW` when reproducibility requirements are unclear.

## Remediation
Add a seeded `torch.Generator` and a `worker_init_fn` that seeds each worker's RNGs.

## Pass example
```python
g = torch.Generator()
g.manual_seed(123)
loader = DataLoader(dataset, num_workers=4, worker_init_fn=seed_worker, generator=g)
```

## Fail example
```python
torch.manual_seed(123)
loader = DataLoader(dataset, num_workers=4, shuffle=True)
```
