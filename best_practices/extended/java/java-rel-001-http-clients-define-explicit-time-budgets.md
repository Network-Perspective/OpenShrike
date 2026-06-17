---
id: java-rel-001
title: Outbound HTTP clients define explicit time budgets
domain: rel
language: java
app-type: [any]
status: active
sources:
  - type: article
    title: Java HttpClient Timeout
  - type: article
    title: Configure Timeouts with Spring RestTemplate
  - type: article
    title: Set a Timeout in Spring WebClient
---

# java-rel-001: Outbound HTTP clients define explicit time budgets

## Intent
Prevent Java outbound HTTP calls from hanging indefinitely or waiting forever on exhausted pools.

## Applicability
Applies to `HttpClient`, `RestTemplate`, `WebClient`, Apache clients, and similar wrappers.

## What to inspect
Connect, read, response, and pool-lease timeout configuration.

## Pass criteria
The changed client path defines explicit time budgets appropriate to the client type.

## Fail criteria
The diff adds or changes outbound HTTP code with no visible timeout policy.

## Do not flag
Test code and obvious one-off tools.

## Confidence guidance
`HIGH` when a timeout-free client is directly visible. `MEDIUM` when a wrapper may own policy. `LOW` when ownership is unclear.

## Remediation
Define explicit connect, response, and pool acquisition timeouts in the client configuration.

## Pass example
```java
HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
```

## Fail example
```java
HttpClient.newHttpClient();
```
