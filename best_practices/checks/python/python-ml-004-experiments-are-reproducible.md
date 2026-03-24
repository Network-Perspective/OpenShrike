# PYTHON-ML-004: Experiments are reproducible enough to explain results

## Intent

Model changes should be traceable to code, data, and configuration rather than
ambient state. Teams cannot reason about regressions if training runs are not
reproducible enough to compare.

## Applicability

Applies to training, hyperparameter search, and benchmark code expected to
inform product or release decisions.

Return `unknown` when the diff does not affect experiment execution.

## Strategy

`heuristic`

## What to inspect

1. Check whether seeds, config, dataset versions, and artifact outputs are
   captured in a stable way.
2. Review whether the training run depends on uncontrolled randomness or mutable
   external data with no record.

## Pass criteria

- Important experiment parameters and seeds are recorded.
- Dataset or feature snapshot identity is tracked where practical.
- Results can be tied back to a specific config and code revision.

## Fail criteria

- A training pipeline that informs releases has no record of seed, config, or
  dataset identity.
- Randomness materially affects results with no attempt to control or record it.

## Do not flag

- Disposable exploratory notebooks.
- Fully deterministic code where seed control is irrelevant.

## Evidence to collect

- The training entry point.
- The missing config, seed, or dataset tracking.

## Confidence guidance

- `HIGH`: release-relevant experiment code lacks basic run provenance.
- `MEDIUM`: some provenance likely exists, but not in visible scope.
- `LOW`: prefer `unknown` if the code is clearly exploratory.

## Remediation

- Persist config, seed, code revision, and dataset identity with artifacts.
- Make important randomness controlled or at least recorded.
