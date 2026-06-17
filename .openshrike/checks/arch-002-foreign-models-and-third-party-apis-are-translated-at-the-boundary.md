---
id: arch-002
title: Foreign models and third-party APIs are translated at the boundary
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Building Evolutionary Architectures
  - type: book
    title: Effective Kotlin
  - type: book
    title: Implementing Domain-Driven Design
    author: Vaughn Vernon
  - type: book
    title: Refactoring
    author: Martin Fowler
---

# arch-002: Foreign models and third-party APIs are translated at the boundary

## Intent
Do not let foreign concepts, vendor SDK shapes, or third-party call choreography leak into local business logic.

## Applicability
Applies when the diff adds or changes integration code to another service, bounded context, vendor SDK, or foreign protocol.

## What to inspect
Client wrappers, translators, adapters, DTOs, and whether local application/domain code consumes foreign models directly.

## Pass criteria
The boundary translates foreign data and APIs into local concepts before business logic consumes them.

## Fail criteria
The diff passes foreign DTOs, SDK types, or raw external structures directly into local business logic.

## Do not flag
Explicit shared-kernel arrangements that are clearly documented and thin transport objects confined to the adapter.

## Confidence guidance
`HIGH` when the local core directly imports or accepts foreign types. `MEDIUM` when translation is partial. `LOW` when the bounded-context boundary is only implied.

## Remediation
Add an owned adapter or translator and keep foreign concepts at the edge.

## Pass example
```java
Author author = collaboratorTranslator.fromUserInRole(response);
forum.startDiscussion(author, subject);
```

## Fail example
```java
UserInRoleResponse user = identityClient.getUserInRole(...);
forum.startDiscussion(user, subject);
```
