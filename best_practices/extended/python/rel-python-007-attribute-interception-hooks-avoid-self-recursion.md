---
id: rel-python-007
title: Attribute interception hooks avoid self-recursion
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
    section: "Item 32: Use __getattr__, __getattribute__, and __setattr__ for Lazy Attributes"
---

# rel-python-007: Attribute interception hooks avoid self-recursion

## Intent
Prevent infinite recursion and crashes in `__getattribute__` and `__setattr__` hooks.

## Applicability
Applies when the diff changes custom attribute interception in Python objects.

## What to inspect
`__getattribute__`, `__setattr__`, and whether hook implementations call `super()` or recurse through `self`.

## Pass criteria
Attribute interception delegates through `super()` or another recursion-safe path.

## Fail criteria
The diff accesses intercepted attributes through `self` inside the interception hook and recurses indefinitely.

## Do not flag
Classes that do not override interception hooks.

## Confidence guidance
`HIGH` when self-recursion is directly visible. `MEDIUM` when helper indirection hides it. `LOW` when metaclass behavior is incomplete.

## Remediation
Use `super().__getattribute__` and `super().__setattr__` in interception hooks.

## Pass example
```python
return super().__getattribute__(name)
```

## Fail example
```python
return self.value
```
