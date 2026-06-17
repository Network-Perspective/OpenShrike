---
id: api-python-002
title: Python public APIs keep optional boolean controls keyword-only
domain: api
language: python
app-type: [library]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
---

# api-python-002: Python public APIs keep optional boolean controls keyword-only

## Intent
Optional behavior toggles are too easy to misread when passed positionally in Python.

## Applicability
Applies to public Python call signatures that include optional behavior-switching booleans.

## What to inspect
Function signatures, call sites, and whether a positional boolean changes behavior instead of representing the domain data itself.

## Pass criteria
Optional behavior booleans are keyword-only or are replaced by a more explicit type when the behavior matters materially.

## Fail criteria
A public API accepts a positional boolean that changes behavior and leaves callers to guess what `True` or `False` means at the call site.

## Do not flag
True domain booleans that are themselves the modeled data rather than an optional mode switch.

## Confidence guidance
`HIGH` when the positional flag is directly visible. `MEDIUM` when wrappers may rename the control. `LOW` when the function is not clearly part of a reusable API.

## Remediation
Make optional boolean controls keyword-only or replace them with a more explicit parameter shape.

## Pass example
```python
def render(report: Report, *, include_totals: bool = False) -> str:
    ...
```

## Fail example
```python
def render(report: Report, include_totals=False):
    ...
render(report, True)
```
