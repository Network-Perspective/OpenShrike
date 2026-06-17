---
id: rel-swift-001
title: SwiftUI state is mutated on the main thread
domain: rel
language: swift
app-type: [other]
status: active
sources:
  - type: book
    title: Thinking in SwiftUI
---

# rel-swift-001: SwiftUI state is mutated on the main thread

## Intent
Prevent UI inconsistency and race warnings from background-thread mutation of SwiftUI-observed state.

## Applicability
Applies to SwiftUI view models, state objects, and callback-driven UI updates.

## What to inspect
Background callbacks, async tasks, and writes to `@State`, `@Published`, or other UI-observed properties.

## Pass criteria
SwiftUI-observed state changes occur on the main actor or main thread.

## Fail criteria
The diff mutates SwiftUI state from a background callback or detached task with no main-thread hop.

## Do not flag
Pure background computation that only returns values and leaves the UI unchanged.

## Confidence guidance
`HIGH` when background mutation is directly visible. `MEDIUM` when threading is inferred from the callback source. `LOW` when actor ownership is incomplete.

## Remediation
Hop back to the main actor before mutating SwiftUI-observed state.

## Pass example
```swift
await MainActor.run { self.items = loaded }
```

## Fail example
```swift
DispatchQueue.global().async { self.items = loaded }
```
