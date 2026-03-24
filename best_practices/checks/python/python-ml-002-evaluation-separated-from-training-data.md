# PYTHON-ML-002: Evaluation is separated from training data

## Intent

Training metrics are not deployment metrics. Model quality should be validated
on held-out data or a comparably independent evaluation path.

## Applicability

Applies to training, benchmark, and experiment code that reports or relies on
model performance.

Return `unknown` when the diff does not touch evaluation or metric reporting.

## Strategy

`reasoning`

## What to inspect

1. Review how metrics are computed and reported.
2. Check whether reported metrics come from held-out validation/test data rather
   than the training set alone.

## Pass criteria

- Reported model quality is based on separated evaluation data or equivalent
  independent validation.

## Fail criteria

- The code reports only training metrics as evidence of model quality.
- Early stopping, selection, or release decisions rely only on training loss or
  accuracy.

## Do not flag

- Intermediate debugging output during development if proper validation still
  exists.
- Unsupervised or representation-learning setups where evaluation is defined
  differently and clearly documented.

## Evidence to collect

- The metric-reporting code.
- The dataset split or lack of one.

## Confidence guidance

- `HIGH`: only training data is used for reported quality.
- `MEDIUM`: validation likely exists elsewhere, but is not visible here.
- `LOW`: prefer `unknown` if experiment flow is incomplete.

## Remediation

- Add held-out evaluation.
- Separate training diagnostics from deployment-quality metrics.
