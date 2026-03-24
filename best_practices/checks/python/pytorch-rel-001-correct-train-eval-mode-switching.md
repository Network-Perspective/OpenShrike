# PYTORCH-REL-001: Training and evaluation use the correct module mode

## Intent

Dropout, batch norm, and related layers behave differently in training and
evaluation. Forgetting `model.train()` or `model.eval()` causes silent metric
errors and unstable serving behavior.

## Applicability

Applies to PyTorch training, validation, testing, and inference loops.

Return `unknown` when the diff does not touch loop control or module execution.

## Strategy

`static`

## What to inspect

1. Review train, validation, and inference loops.
2. Check whether the model mode is set appropriately before each phase.

## Pass criteria

- Training paths call `model.train()`.
- Validation and inference paths call `model.eval()`.

## Fail criteria

- Validation or inference runs with the model left in training mode.
- Training resumes without switching back from eval mode.

## Do not flag

- Models without mode-sensitive layers if that is obvious and intentional.
- Helper abstractions where the mode switch is visible elsewhere in scope.

## Evidence to collect

- The phase loop.
- The missing or incorrect mode switch.

## Confidence guidance

- `HIGH`: phase loop and missing mode switch are directly visible.
- `MEDIUM`: helper abstractions likely own the switch, but are partly out of
  scope.
- `LOW`: prefer `unknown` if execution ownership is unclear.

## Remediation

- Set `model.train()` for training phases and `model.eval()` for evaluation and
  inference phases.
