---
id: data-python-018
title: Python byte-oriented file work opens files in binary mode
domain: data
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
    chapter: "Item 3: Know the Differences Between bytes, str, and unicode"
---

# data-python-018: Python byte-oriented file work opens files in binary mode

## Intent
Keep Python byte I/O from silently passing through text-mode transcoding.

## Applicability
Applies to Python file or stream code handling `bytes`. Return `unknown` when the boundary object is supplied elsewhere.

## What to inspect
`open(...)`, mode strings, `bytes` reads or writes, and file handles passed to binary encoders or decoders.

## Pass criteria
Byte-oriented reads and writes use binary mode such as `rb` or `wb`.

## Fail criteria
Code reads or writes raw `bytes` through text-mode file handles.

## Do not flag
Pure text I/O where `str` is the intended contract.

## Confidence guidance
`HIGH` when `bytes` are used with text mode. `MEDIUM` when wrapper types may convert earlier. `LOW` when the payload type is not visible.

## Remediation
Open byte streams in binary mode and keep text encoding explicit elsewhere.

## Pass example
```python
with open(path, "wb") as f:
    f.write(payload)
```

## Fail example
```python
with open(path, "w") as f:
    f.write(payload)
```
