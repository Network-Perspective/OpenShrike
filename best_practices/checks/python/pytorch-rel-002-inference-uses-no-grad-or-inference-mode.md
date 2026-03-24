# PYTORCH-REL-002: Evaluation and inference disable gradient tracking

## Intent

Evaluation should not waste memory and compute on gradient tracking. Forgetting
`torch.no_grad()` or `torch.inference_mode()` makes inference slower and can
produce unnecessary memory pressure.

## Applicability

Applies to PyTorch validation, test, and inference code.

Return `unknown` when execution is hidden behind helpers out of scope.

## Strategy

`static`

## What to inspect

1. Review validation and inference loops.
2. Check whether forward passes run under `torch.no_grad()` or
   `torch.inference_mode()`.

## Pass criteria

- Non-training forward passes disable gradient tracking.

## Fail criteria

- Evaluation or inference performs forward passes with gradient tracking still
  enabled.

## Do not flag

- Training code.
- Explainability or gradient-based attribution flows that intentionally require
  gradients.

## Evidence to collect

- The inference or eval loop.
- The missing no-grad or inference-mode guard.

## Confidence guidance

- `HIGH`: inference loop without disabled gradients is directly visible.
- `MEDIUM`: helper wrappers may own the guard, but are not shown.
- `LOW`: prefer `unknown` if execution ownership is unclear.

## Remediation

- Wrap eval and inference in `torch.no_grad()` or `torch.inference_mode()`.
