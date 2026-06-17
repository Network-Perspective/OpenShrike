---
id: api-python-001
title: Python public APIs signal failure with exceptions under a shared public error base
domain: api
language: python
app-type: [library]
status: active
sources:
  - type: book
    title: Effective Python
    author: Brett Slatkin
---

# api-python-001: Python public APIs signal failure with exceptions under a shared public error base

## Intent
Python callers should not have to guess whether `None` means a benign empty case, a bug, or a real failure, and they need one intentional base type for public API errors.

## Applicability
Applies to public Python functions, classes, and reusable modules.

## What to inspect
Return values used as failure sentinels, raised exception types, and whether documented API errors share a root class callers can catch deliberately.

## Pass criteria
Public APIs raise exceptions for true error cases instead of returning `None` as an error sentinel, and intentional API errors inherit from a shared public base class.

## Fail criteria
A public API returns `None` for an error path that can be confused with a real value, or forces callers to catch a grab-bag of unrelated exception classes because there is no intentional public error base.

## Do not flag
Benign empty-result cases that are explicitly part of the contract, or one-off application scripts with no reusable caller contract.

## Confidence guidance
`HIGH` when the return or exception contract is directly visible. `MEDIUM` when some exceptions may be wrapped elsewhere. `LOW` when the public status of the code is unclear.

## Remediation
Raise a public API exception type for failures and keep a shared base class for intentional caller-facing errors.

## Pass example
```python
class ApiError(Exception):
    pass


def read_user(user_id: str) -> User:
    raise UserNotFound(user_id)
```

## Fail example
```python
def read_user(user_id: str) -> User | None:
    return None
```
