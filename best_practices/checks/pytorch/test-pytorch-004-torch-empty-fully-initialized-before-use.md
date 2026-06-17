---
id: test-pytorch-004
title: PyTorch tensors allocated with torch.empty are fully initialized before use
domain: test
language: pytorch
app-type: [any]
status: active
sources:
  - type: web
    title: "PyTorch official docs: Reproducibility page, torch.no_grad/eval semantics, and Performance Tuning Guide"
---

# test-pytorch-004: PyTorch tensors allocated with torch.empty are fully initialized before use

## Intent
Reading from a `torch.empty(...)` buffer before all elements are written leaks uninitialized memory into model computation and creates nondeterministic behavior.

## Applicability
Applies when the diff adds or changes `torch.empty(...)` allocations whose contents are later read, returned, logged, or passed into computation. Return `unknown` when a downstream library call may fully initialize the buffer but that behavior is not visible.

## What to inspect
Check calls to `torch.empty`, subsequent writes, and any later reads, returns, arithmetic, concatenation, or model inputs that consume the buffer.

## Pass criteria
The `torch.empty` tensor is fully initialized before any read or use, or the code uses an initialized constructor such as `zeros`, `ones`, or `full` instead.

## Fail criteria
The changed code reads from, returns, or computes with a tensor allocated by `torch.empty` before all of its elements are definitely written.

## Do not flag
Output buffers passed to an operation that clearly fills the entire tensor, or low-level code with explicit full assignment before use.

## Confidence guidance
`HIGH` when read-before-write is visible in the same function. `MEDIUM` when initialization happens through a nearby helper or loop. `LOW` when a library call may initialize the tensor but the evidence is incomplete.

## Remediation
Initialize the tensor before any read, or replace `torch.empty` with an initialized constructor.

## Pass example
```python
buf = torch.empty(3)
buf[:] = torch.tensor([1.0, 2.0, 3.0])
score = buf.sum()
```

## Fail example
```python
buf = torch.empty(3)
score = buf.sum()
```
