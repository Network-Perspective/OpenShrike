---
id: data-java-011
title: Java transactions declare rollback for checked failures
domain: data
language: java
app-type:
  - any
status: active
sources:
  - type: article
    title: Spring @Transactional Annotation - Pitfalls and Best Practices
    publisher: Baeldung
    section: Common Pitfalls section 3
---

# data-java-011: Java transactions declare rollback for checked failures

## Intent
Keep Spring-managed durable writes rollback-safe when checked exceptions signal failure.

## Applicability
Applies to Spring transactional methods that can throw checked exceptions. Return `unknown` when transaction policy is configured elsewhere.

## What to inspect
`@Transactional`, checked exception types, `rollbackFor`, and write operations inside the method.

## Pass criteria
Transactional write methods either throw runtime exceptions on failure or declare rollback rules for checked exceptions that should abort persistence.

## Fail criteria
A checked exception path can leave durable writes committed because Spring's default rollback rules do not cover it.

## Do not flag
Read-only transactions or checked exceptions that intentionally report success-adjacent conditions.

## Confidence guidance
`HIGH` when a write method throws a checked exception without rollback configuration. `MEDIUM` when a higher-level transaction wrapper may exist. `LOW` when only interfaces are visible.

## Remediation
Add `rollbackFor` or convert failure signaling so transactional boundaries roll back as intended.

## Pass example
```java
@Transactional(rollbackFor = IOException.class)
void importData() throws IOException { ... }
```

## Fail example
```java
@Transactional
void importData() throws IOException { ... }
```
