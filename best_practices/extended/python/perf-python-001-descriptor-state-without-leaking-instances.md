---
id: perf-python-001
title: Store descriptor state without leaking instances
domain: perf
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
    section: "Item 31: Use Descriptors for Reusable @property Methods"
---

# perf-python-001: Store descriptor state without leaking instances

## Intent
Prevent memory leaks in reusable descriptors that keep strong references to every instance they have seen.

## Applicability
Applies only to descriptor classes that implement `__get__` or `__set__` and store per-instance data outside the instance itself. Return `unknown` if the descriptor stores no per-instance state or if the storage abstraction hides whether references are weak.

## What to inspect
Inspect descriptor classes for `self._values = {}` or similar storage, and for writes like `self._values[instance] = value`.

## Pass criteria
Per-instance descriptor state is stored on the instance itself or in a `weakref.WeakKeyDictionary`.

## Fail criteria
The diff introduces a descriptor that keeps per-instance values in a normal dictionary keyed by `instance`.

## Do not flag
Do not flag descriptors that are stateless, descriptors that write to `instance.__dict__`, or caches that intentionally keep strong references and clearly bound their lifecycle.

## Confidence guidance
`HIGH` when a descriptor both defines `__get__` or `__set__` and writes `instance` keys into a plain dict. `MEDIUM` when the storage type is imported under an alias. `LOW` when the descriptor delegates storage to another object.

## Remediation
Use `weakref.WeakKeyDictionary` or store the value on the instance instead of a plain dict keyed by the instance.

## Pass example
```python
from weakref import WeakKeyDictionary


class Grade:
    def __init__(self):
        self._values = WeakKeyDictionary()

    def __set__(self, instance, value):
        self._values[instance] = value
```

## Fail example
```python
class Grade:
    def __init__(self):
        self._values = {}

    def __set__(self, instance, value):
        self._values[instance] = value
```
