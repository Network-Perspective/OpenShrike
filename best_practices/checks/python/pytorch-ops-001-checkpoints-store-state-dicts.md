# PYTORCH-OPS-001: Checkpoints store portable state rather than whole model objects

## Intent

Saving whole Python objects couples artifacts to exact code layout and pickling
semantics. Portable checkpoints should store `state_dict` and explicit metadata
instead.

## Applicability

Applies to PyTorch training and model export code that writes checkpoints.

Return `unknown` when artifact writing is outside scope.

## Strategy

`static`

## What to inspect

1. Review checkpoint serialization code.
2. Check whether `torch.save(model, ...)` is used instead of saving
   `state_dict` plus metadata.

## Pass criteria

- Checkpoints persist `model.state_dict()`, optimizer state when needed, and
  explicit metadata.

## Fail criteria

- The code serializes the whole model object for routine checkpoints or release
  artifacts.

## Do not flag

- Short-lived research experiments where portability is irrelevant and clearly
  scoped.
- Export formats like TorchScript or ONNX with explicit intent.

## Evidence to collect

- The checkpoint save call.
- The serialized object shape.

## Confidence guidance

- `HIGH`: `torch.save(model, ...)` is directly visible.
- `MEDIUM`: helper wrappers suggest whole-object serialization, but are partly
  out of scope.
- `LOW`: prefer `unknown` if artifact format is hidden.

## Remediation

- Save `state_dict` plus explicit metadata.
- Keep model class code and artifact format decoupled.
