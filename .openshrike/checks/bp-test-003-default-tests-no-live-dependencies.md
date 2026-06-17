---
id: bp-test-003
title: Default automated tests do not require live external dependencies
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Accelerate + DORA reports
  - type: book
    title: Building Secure and Reliable Systems
  - type: article
    title: Google Testing Blog
  - type: article
    title: My Selenium Tests Aren't Stable!
    author: Simon Stewart
  - type: article
    title: Practical Test Pyramid
    author: Ham Vocke
  - type: book
    title: Software Engineering at Google
  - type: book
    title: "Unit Testing: Principles, Practices, and Patterns"
    author: Vladimir Khorikov
  - type: book
    title: "xUnit Test Patterns: Refactoring Test Code"
    author: Gerard Meszaros
---

# bp-test-003: Default automated tests do not require live external dependencies

## Intent
Routine PR validation should be fast, hermetic, and reproducible. Live external services, shared remote environments, production endpoints, and production data create flaky failures, hidden credentials requirements, and unsafe test behavior.

## Applicability
Applies to unit, integration, contract, and browser tests expected to run in the default developer or CI path. Return `unknown` when the repository's test taxonomy is not visible.

## What to inspect
Review changed tests and test configuration for real URLs, cloud resources, shared remote environments, ambient credential use, or production-like data sources.

## Pass criteria
Default tests use local or hermetic dependencies such as in-process servers, localhost services, local emulators, disposable containers, or repo-owned fakes. True end-to-end checks are clearly separated or opt-in.

## Fail criteria
Ordinary test runs call real external services, require developer or CI secrets, hit production endpoints, or depend on production data.

## Do not flag
Loopback services, in-process test servers, local containers, or clearly isolated smoke or post-deploy suites outside normal PR gating.

## Confidence guidance
`HIGH` when a default test directly targets a real remote service or production-like system. `MEDIUM` when the dependency is visible but isolation status is inferred. `LOW` when endpoint ownership is unclear.

## Remediation
Replace live dependencies with local emulators, mocks, or disposable containers, and move true end-to-end coverage behind an explicit gate.

## Pass example
```csharp
await using var api = new WebApplicationFactory<Program>();
var client = api.CreateClient();
var response = await client.GetAsync("/health");
```

## Fail example
```csharp
var client = new HttpClient();
var response = await client.GetAsync("https://api.partner.example.com/health");
```
