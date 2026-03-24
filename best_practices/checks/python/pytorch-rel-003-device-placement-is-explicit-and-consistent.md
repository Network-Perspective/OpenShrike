# PYTORCH-REL-003: Device placement is explicit and consistent

## Intent

PyTorch code should make tensor and model device placement obvious. Silent
mixing of CPU and GPU tensors creates runtime failures and non-obvious
performance problems.

## Applicability

Applies to PyTorch training and inference code that uses accelerators or moves
data between devices.

Return `unknown` when the code is clearly CPU-only or device handling is outside
scope.

## Strategy

`heuristic`

## What to inspect

1. Review model creation, batch preparation, and forward passes.
2. Check whether model and tensors are moved to the same device explicitly.

## Pass criteria

- Device selection is explicit.
- Inputs, targets, and model parameters are placed consistently.

## Fail criteria

- The diff introduces mixed CPU/GPU tensor usage likely to fail at runtime.
- Device handling is implicit and inconsistent across train and inference paths.

## Do not flag

- CPU-only code.
- Small helper utilities that do not own device placement.

## Evidence to collect

- The model or tensor placement code.
- The inconsistent or missing device movement.

## Confidence guidance

- `HIGH`: inconsistent device placement is directly visible.
- `MEDIUM`: helper code likely moves tensors, but it is not fully shown.
- `LOW`: prefer `unknown` if accelerator usage is unclear.

## Remediation

- Select device explicitly.
- Move model and all relevant tensors consistently at the phase boundary.
