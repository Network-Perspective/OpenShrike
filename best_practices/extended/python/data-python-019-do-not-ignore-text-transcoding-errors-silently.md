---
id: data-python-019
title: Do not ignore text transcoding errors silently
domain: data
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Fluent Python (2nd ed.)
    chapter: 'ch04 "Coping with UnicodeEncodeError"'
---

# data-python-019: Do not ignore text transcoding errors silently

## Intent
Prevent silent data loss when Python text cannot be represented in the selected encoding.

## Applicability
Applies to Python `encode`, `decode`, and text file operations with custom error handlers. Return `unknown` when transcoding happens in a hidden dependency.

## What to inspect
`errors=` handlers, open calls, explicit `encode` or `decode`, and fallback replacement behavior.

## Pass criteria
Transcoding uses strict handling or an explicitly reviewed non-silent strategy that preserves failure visibility.

## Fail criteria
Code uses `errors="ignore"` or another silent-drop path that discards undecodable or unencodable characters.

## Do not flag
Deliberate replacement strategies like `backslashreplace` or logged remediation flows where data loss is explicit and reviewed.

## Confidence guidance
`HIGH` when `ignore` is directly present. `MEDIUM` when a helper may override the handler. `LOW` when only file wrappers are visible.

## Remediation
Use strict handling by default and choose an explicit loss-visible strategy only when the contract requires it.

## Pass example
```python
text.encode("utf-8", errors="strict")
```

## Fail example
```python
text.encode("utf-8", errors="ignore")
```
