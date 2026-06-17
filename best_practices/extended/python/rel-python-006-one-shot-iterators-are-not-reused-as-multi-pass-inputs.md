---
id: rel-python-006
title: One-shot iterators are not reused as multi-pass inputs
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
    chapter: "Item 17: Be Defensive When Iterating Over Arguments"
---

# rel-python-006: One-shot iterators are not reused as multi-pass inputs

## Intent
Prevent silently empty second passes over generators and other one-shot iterators.

## Applicability
Applies when code iterates more than once over a value that may be a generator or iterator.

## What to inspect
Repeated loops, `sum` plus later iteration, and helpers accepting generic iterables for multi-pass work.

## Pass criteria
Multi-pass logic materializes or recreates one-shot iterators before reusing them.

## Fail criteria
The diff consumes a generator or iterator once and then reuses it as though it still contains data.

## Do not flag
Concrete collections like lists and tuples.

## Confidence guidance
`HIGH` when a one-shot iterator is directly reused. `MEDIUM` when iterability type is inferred. `LOW` when input shape is unclear.

## Remediation
Materialize the iterator or accept a collection instead of a one-shot stream.

## Pass example
```python
rows = list(source)
```

## Fail example
```python
total = sum(rows)
for row in rows:
    ...
```
