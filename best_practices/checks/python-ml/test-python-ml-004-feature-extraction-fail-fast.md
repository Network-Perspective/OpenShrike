---
id: test-python-ml-004
title: Feature extraction failures fail fast instead of degrading silently
domain: test
language: python-ml
app-type: [any]
status: active
sources:
  - type: book
    title: Machine Learning Engineering
    author: Andriy Burkov
---

# test-python-ml-004: Feature extraction failures fail fast instead of degrading silently

## Intent
Feature extractors should fail loudly when required inputs or dependencies are broken, rather than silently returning NaNs, nulls, empty values, or partial outputs that corrupt model behavior.

## Applicability
Applies when the diff changes feature extraction, preprocessing validation, or test or gate logic around extracted features. Return `unknown` when the code does not affect feature extraction behavior.

## What to inspect
Check extractor outputs, validation assertions, NaN or null handling, dependency failures, and whether tests or gates treat broken extraction as a hard failure.

## Pass criteria
Broken extraction paths are detected and turned into explicit failures through assertions, validators, or tests, rather than silently flowing through as ordinary feature values.

## Fail criteria
The changed extractor swallows dependency failures, returns silent NaNs or nulls for required features, or lets partial feature sets proceed with no hard failure.

## Do not flag
Optional best-effort enrichments that are clearly marked optional, or legitimate zero-valued features that are not acting as hidden error sentinels.

## Confidence guidance
`HIGH` when silent invalid feature outputs are directly visible. `MEDIUM` when helpers hide part of the extraction path. `LOW` when optionality is unclear.

## Remediation
Add explicit validation and tests that fail when required extracted features are missing, invalid, or partial.

## Pass example
```python
features = extract_features(record)
if np.isnan(features['age_bucket_score']):
    raise ValueError('feature extraction failed')
```

## Fail example
```python
features = extract_features(record)
features['age_bucket_score'] = np.nan_to_num(features['age_bucket_score'])
model.predict([features])
```
