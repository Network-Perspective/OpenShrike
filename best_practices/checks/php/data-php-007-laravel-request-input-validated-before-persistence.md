---
id: data-php-007
title: Laravel request input is validated before persistence or business logic uses it
domain: data
language: php
app-type: [http-service]
status: active
sources:
  - type: documentation
    title: "Laravel Official Documentation: Security, Validation, Authentication, Authorization, and Queue sections"
---

# data-php-007: Laravel request input is validated before persistence or business logic uses it

## Intent
Ensure Laravel request boundaries convert incoming data into a validated subset before persistence or business logic uses it.

## Applicability
Applies to controllers, form requests, jobs, and actions consuming request input. Return `unknown` when validation is handled by an out-of-scope request object.

## What to inspect
`$request->validate()`, `validated()`, `safe()`, `all()`, and mass-assignment or service calls.

## Pass criteria
Downstream code reads only validated request data or an equivalent parsed subset.

## Fail criteria
Raw request payloads from `all()`, `input()`, or the request object are passed into persistence or business logic instead of the validated subset.

## Do not flag
Framework-injected scalar route parameters or already validated form request accessors.

## Confidence guidance
`HIGH` when raw request arrays flow into writes. `MEDIUM` when validation may happen in a form request. `LOW` when only the callee is visible.

## Remediation
Validate at the boundary and pass only `validated()` data or the minimal `safe()->only(...)` subset downstream.

## Pass example
```php
$payload = $request->validated();
User::create($payload);
```

## Fail example
```php
User::create($request->all());
```
