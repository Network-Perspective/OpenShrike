---
id: python-ml-004
title: Experiments are reproducible enough to explain results
domain: test
language: python-ml
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Machine Learning Systems
    author: Chip Huyen
    chapter: Chapter 6 "Debugging ML Models"
    section: Set a random seed
---

# python-ml-004: Experiments are reproducible enough to explain results

## Intent
Model changes should be traceable to code, data, configuration, and controlled randomness rather than ambient state. Teams cannot reason about regressions if training runs are not reproducible enough to compare.

## Applicability
Applies to training, hyperparameter search, and benchmark code expected to inform product or release decisions. Return `unknown` when the diff does not affect experiment execution.

## What to inspect
Check whether seeds, config, dataset identity, code revision, and artifact outputs are captured in a stable way, and whether the run depends on uncontrolled randomness.

## Pass criteria
Important experiment parameters and seeds are recorded. Dataset or feature snapshot identity is tracked where practical. Results can be tied back to a specific config and code revision.

## Fail criteria
A release-relevant training path has no record of seed, config, or dataset identity, or uncontrolled randomness materially affects results with no attempt to control or record it.

## Do not flag
Disposable exploratory notebooks or fully deterministic code where seed control is irrelevant.

## Confidence guidance
`HIGH` when release-relevant experiment code lacks basic run provenance. `MEDIUM` when some provenance likely exists but not in visible scope. `LOW` when the code is clearly exploratory.

## Remediation
Persist config, seed, code revision, and dataset identity with artifacts, and make important randomness controlled or at least recorded.

## Pass example
```python
run = {
    'seed': 7,
    'dataset_version': dataset_version,
    'git_sha': os.environ['GIT_SHA'],
    'config': config,
}
save_run_metadata(run)
```

## Fail example
```python
model = train_model(data)
save_model(model)

# No seed, config, dataset version, or code revision is recorded.
```
