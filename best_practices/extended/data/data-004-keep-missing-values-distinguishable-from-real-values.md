---
id: data-004
title: Keep missing values distinguishable from real values
domain: data
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Designing Machine Learning Systems
    author: Chip Huyen
    year: 2022
    chapter: Chapter 5 "Handling Missing Values"
    section: Imputation
---

# data-004: Keep missing values distinguishable from real values

## Intent
Avoid collapsing missingness into a valid business or model value.

## Applicability
Applies to feature engineering, ETL cleanup, and imputation logic. Return `unknown` when missing-value handling is hidden.

## What to inspect
Imputers, fill defaults, sentinel values, missingness indicator columns, and schema nullability.

## Pass criteria
Missing values remain distinguishable through explicit nulls, sentinels outside the valid domain, or paired missingness indicators.

## Fail criteria
Missing values are replaced with ordinary real values such as `0`, empty strings, or valid categories without any way to tell they were absent.

## Do not flag
Domains where the replacement value is provably impossible and is documented as a sentinel.

## Confidence guidance
`HIGH` when a valid domain value is used as an unmarked fill. `MEDIUM` when the valid range is inferred. `LOW` when downstream indicators may exist out of scope.

## Remediation
Preserve nullability or add explicit missingness markers so models and business logic can distinguish absent from observed data.

## Pass example
```python
df["age_missing"] = df["age"].isna()
df["age"] = df["age"].fillna(df["age"].median())
```

## Fail example
```python
df["age"] = df["age"].fillna(0)
```
