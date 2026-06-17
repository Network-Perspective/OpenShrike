---
id: doc-swift-001
title: Exported Swift API declarations are documented
domain: doc
language: swift
app-type: [library]
status: active
sources:
  - type: guideline
    title: Swift API Design Guidelines
    section: Fundamentals / Write a documentation comment
---

# doc-swift-001: Exported Swift API declarations are documented

## Intent
Undocumented exported Swift APIs are easy for consumers to misuse and hard to
evolve safely. Requiring a concise doc comment on public declarations reduces
integration mistakes and long-term maintenance churn for reusable Swift
libraries.

## Applicability
Applies when the diff adds or changes `public` or `open` declarations in a
Swift package, framework, or other repository that exposes Swift APIs to
external callers. Return `unknown` if the repo appears to be an app-only
codebase with no externally consumed API surface, or if the changed declaration
is not externally visible.

## What to inspect
Added or modified `public` and `open` declarations, their surrounding doc
comments, module or package structure, and whether the repository publishes
reusable Swift APIs.

## Pass criteria
- Each changed exported declaration has a Swift doc comment (`///` or
  equivalent) with a short summary that describes what the entity does,
  returns, creates, accesses, or is.

## Fail criteria
- A changed `public` or `open` declaration is added without a doc comment
  summary, or the comment is placeholder text that does not describe the
  declaration's behavior.

## Do not flag
- Private, internal, or fileprivate declarations.
- Test-only helpers.
- Generated or vendored code.
- Overrides or protocol conformances that clearly inherit unchanged
  documentation.

## Confidence guidance
- `HIGH`: the diff shows an exported declaration with or without a nearby doc
  comment.
- `MEDIUM`: repository context suggests the code is externally consumed but
  visibility or inherited documentation needs inference.
- `LOW`: the repo's API-consumer boundary is unclear.

## Remediation
- Add a concise Swift documentation comment summary to the exported declaration.

## Pass example
```swift
/// Returns a tokenized representation of `source`.
public func parse(_ source: String) throws -> [Token] {
    []
}
```

## Fail example
```swift
public func parse(_ source: String) throws -> [Token] {
    []
}
```
