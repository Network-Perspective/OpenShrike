---
id: java-sec-003
title: SQL remains parameterized
domain: sec
language: java
app-type: [any]
status: active
sources: []
---

# java-sec-003: SQL remains parameterized

## Intent
Raw SQL construction is an injection boundary. Java code should keep query text and values separate whether it uses JDBC, JPA native queries, jOOQ, or other data access layers.

## Applicability
Applies when the diff introduces or changes raw SQL or native query paths. Return `unknown` when the final query renderer is hidden behind abstractions.

## What to inspect
SQL strings, native query APIs, and string concatenation from external values.

## Pass criteria
Values are bound through parameters or placeholders, and dynamic identifiers come from allowlists.

## Fail criteria
External values are concatenated into SQL text, or native query APIs are used with untrusted fragments and no parameter binding.

## Do not flag
Constant administrative SQL with no external input. ORM query builders that parameterize safely.

## Confidence guidance
`HIGH` when direct concatenation is visible. `MEDIUM` when trust level is inferred. `LOW` when rendering is hidden.

## Remediation
Bind parameters instead of concatenating values, and allowlist dynamic identifiers.

## Pass example
```java
PreparedStatement ps = conn.prepareStatement("select * from users where email = ?");
```

## Fail example
```java
String sql = "select * from users where email = '" + email + "'";
```
