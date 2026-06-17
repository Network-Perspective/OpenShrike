---
id: test-009
title: Prefer outcome assertions over interaction-only mock choreography
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: article
    title: Practical Test Pyramid
    author: Ham Vocke
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
  - type: book
    title: "Unit Testing: Principles, Practices, and Patterns"
    author: Vladimir Khorikov
---

# test-009: Prefer outcome assertions over interaction-only mock choreography

## Intent
Interaction-only tests that verify internal collaborator chatter are brittle and often miss whether the code produced the correct result.

## Applicability
Applies when the diff adds or changes tests that use mocks, spies, or explicit interaction verification. Return `unknown` when the interaction itself is the external contract.

## What to inspect
Look at mock setup and verification calls, the collaborator being mocked, and whether that collaborator is internal code or an application boundary to an external system.

## Pass criteria
The test mainly asserts returned results, persisted state, or another observable outcome, and uses interaction checks only where the interaction itself is an external boundary effect.

## Fail criteria
The test treats internal call counts, call order, or collaborator chatter as the main evidence of correctness even though the outcome is observable.

## Do not flag
External boundary effects such as published messages, sent emails, or outbound API calls whose occurrence is itself the contract.

## Confidence guidance
`HIGH` when the mocked collaborator is clearly internal and the test only verifies calls. `MEDIUM` when boundary ownership is inferred from module layout. `LOW` when it is unclear whether the dependency is externally observable.

## Remediation
Replace internal interaction assertions with assertions on returned values, persisted state, or another observable result.

## Pass example
```javascript
expect(result.total).toBe(42)
```

## Fail example
```javascript
expect(repo.save).toHaveBeenCalledTimes(1)
expect(logger.info).toHaveBeenCalledBefore(metrics.record)
```
