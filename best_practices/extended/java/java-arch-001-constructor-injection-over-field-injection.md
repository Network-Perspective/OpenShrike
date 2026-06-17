---
id: java-arch-001
title: Runtime dependencies are explicit through constructors
domain: arch
language: java
app-type: [any]
status: active
sources: []
---

# java-arch-001: Runtime dependencies are explicit through constructors

## Intent
Field injection hides required collaborators and makes objects harder to test and reason about.

## Applicability
Applies to DI-managed Java applications, especially Spring or Jakarta-based services.

## What to inspect
Changed services, controllers, handlers, and their dependency injection style.

## Pass criteria
Required dependencies are supplied through constructors.

## Fail criteria
The diff injects required collaborators through fields or broad setter injection.

## Do not flag
Legitimate optional framework setters and tests.

## Confidence guidance
`HIGH` when field injection is direct. `MEDIUM` when requiredness is inferred. `LOW` when container ownership is unclear.

## Remediation
Convert required dependencies to constructor injection.

## Pass example
```java
OrderService(PaymentPort payments) { this.payments = payments; }
```

## Fail example
```java
@Autowired private PaymentPort payments;
```
