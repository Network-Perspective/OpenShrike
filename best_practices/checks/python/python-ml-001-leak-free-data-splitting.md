# PYTHON-ML-001: Data splitting prevents target and preprocessing leakage

## Intent

Model evaluation should measure generalization, not how much information leaked
from validation or test data into training. Leakage produces deceptively good
metrics and bad deployment outcomes.

## Applicability

Applies to code that trains, validates, or cross-validates classical ML models.

Return `unknown` when the diff does not touch data preparation or evaluation.

## Strategy

`reasoning`

## What to inspect

1. Review split logic and preprocessing pipelines.
2. Check whether fitting, scaling, imputation, encoding, or feature selection
   happens before train/validation/test separation.

## Pass criteria

- Data is split before fit-only preprocessing is learned.
- Cross-validation pipelines fit transformers inside each fold.

## Fail criteria

- Preprocessing is fit on the full dataset before splitting.
- Feature engineering consumes target or future information that would not be
  available at inference time.

## Do not flag

- Pure inference pipelines.
- Read-only feature inspection with no learned statistics.

## Evidence to collect

- The split boundary.
- The fit or leakage step that happens too early.

## Confidence guidance

- `HIGH`: preprocessing or feature selection is clearly fit before splitting.
- `MEDIUM`: leakage is likely, but some pipeline code is out of scope.
- `LOW`: prefer `unknown` when train/eval flow is incomplete.

## Remediation

- Split before fitting preprocessors.
- Use fold-aware pipelines for cross-validation.
