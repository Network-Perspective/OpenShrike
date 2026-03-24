# PYTHON-ML-003: Training and serving share the same preprocessing contract

## Intent

A model is only as correct as the feature transformation used at inference.
Training and serving paths should not independently reimplement preprocessing in
ways that drift.

## Applicability

Applies to repositories that both train and serve models or that export feature
transforms alongside trained artifacts.

Return `unknown` when only one side of the train/serve boundary is visible.

## Strategy

`reasoning`

## What to inspect

1. Review how features are transformed during training.
2. Review how serving or batch inference builds the same features.
3. Check whether both flows share a persisted transformer, contract, or common
   code path.

## Pass criteria

- Training and serving use the same persisted transformer or shared feature
  pipeline.

## Fail criteria

- Serving reconstructs preprocessing manually and independently from training.
- Feature ordering, normalization, or categorical handling can drift between
  train and serve paths.

## Do not flag

- Pure research code with no serving path.
- Repos that intentionally export a formal feature schema or transformer artifact.

## Evidence to collect

- The training preprocessing path.
- The divergent serving or inference preprocessing path.

## Confidence guidance

- `HIGH`: train and serve preprocessing are visibly different.
- `MEDIUM`: drift risk is strong, but one side is partly out of scope.
- `LOW`: prefer `unknown` if serving is not visible.

## Remediation

- Persist and reuse the trained preprocessor.
- Share feature-building code or a formal feature contract.
