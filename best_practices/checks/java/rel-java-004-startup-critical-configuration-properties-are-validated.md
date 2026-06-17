---
id: rel-java-004
title: Startup-critical configuration properties are validated
domain: rel
language: java
app-type: [any]
status: active
sources:
  - type: documentation
    title: Spring Boot official documentation
---

# rel-java-004: Startup-critical configuration properties are validated

## Intent
Fail fast on missing or out-of-range configuration instead of discovering it at runtime.

## Applicability
Applies to Spring Boot `@ConfigurationProperties` and other startup-bound configuration models.

## What to inspect
Required fields, numeric bounds, nested validation, and startup validation hooks.

## Pass criteria
Startup-critical configuration is bound to a validated model, including nested objects and numeric ranges.

## Fail criteria
The diff introduces required or bounded configuration with no visible validation.

## Do not flag
Truly optional settings with safe defaults.

## Confidence guidance
`HIGH` when the missing validation is directly visible. `MEDIUM` when validation may be declared elsewhere. `LOW` when configuration ownership is partial.

## Remediation
Add bean validation or equivalent startup validation to the configuration model.

## Pass example
```java
@Validated
record ClientProps(@NotBlank String url, @Min(1) int timeoutSeconds) {}
```

## Fail example
```java
record ClientProps(String url, int timeoutSeconds) {}
```
