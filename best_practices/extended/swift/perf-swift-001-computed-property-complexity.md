---
id: perf-swift-001
title: Document non-constant computed property complexity
domain: perf
language: swift
app-type: [any]
status: active
sources:
  - type: guideline
    title: Swift API Design Guidelines
    section: Conventions / General Conventions / Document the complexity of any computed property that is not O(1)
---

# perf-swift-001: Document non-constant computed property complexity

## Intent
Callers often assume property access is cheap. When a computed property performs linear or worse work without saying so, production code can accidentally put expensive work on hot paths and cause latency regressions.

## Applicability
Applies when the diff adds or changes a computed property whose body clearly traverses collections, performs sorting or filtering, allocates proportional work, or otherwise appears to be worse than O(1). Return `unknown` if complexity cannot be inferred from the repository, or if the property is stored, cached, or a trivial constant-time wrapper.

## What to inspect
Inspect computed property bodies, any adjacent documentation comments, and whether the property is part of reused library or framework code where callers could reasonably assume cheap access.

## Pass criteria
The computed property is evidently O(1), or its documentation explicitly states the non-constant complexity, such as a `- Complexity:` note or equivalent explanation.

## Fail criteria
The diff adds or changes a computed property with obvious non-constant work and there is no documentation warning callers about that cost.

## Do not flag
Do not flag stored properties, `lazy` properties, cached lookups with obvious constant-time behavior, private or test-only helpers, or properties whose implementation cost is not statically clear.

## Confidence guidance
`HIGH` when the body visibly loops, filters, sorts, or reduces over data and no complexity note exists. `MEDIUM` when cost is strongly implied through called helpers or collection traversals. `LOW` when complexity depends on implementation details outside the diff.

## Remediation
Document the property's non-constant complexity next to the declaration.

## Pass example
```swift
/// All active users.
/// - Complexity: O(n) over `storage`.
public var activeUsers: [User] {
    storage.filter(\.isActive)
}
```

## Fail example
```swift
public var activeUsers: [User] {
    storage.filter(\.isActive)
}
```
