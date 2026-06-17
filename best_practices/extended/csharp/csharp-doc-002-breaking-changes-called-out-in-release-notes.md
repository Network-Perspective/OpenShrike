---
id: csharp-doc-002
title: Public breaking changes in C# packages are called out in release notes
domain: doc
language: csharp
app-type: [library]
status: active
sources: []
---

# csharp-doc-002: Public breaking changes in C# packages are called out in release notes

## Intent
Consumers should not discover breaking changes by accident. If a versioned
package or public contract changes incompatibly, the release notes should say
so explicitly.

## Applicability
Applies only to externally versioned libraries, SDKs, or public API contracts.

Return `unknown` for internal-only services or when release-note ownership is
not visible.

## What to inspect
1. Identify breaking changes to public APIs or documented contracts.
2. Look for changelog or release-note updates in the diff or nearby release
   files.
3. Check whether deprecations and removals are called out clearly enough for
   consumers to plan migration.

## Pass criteria
- Breaking changes are documented with migration guidance or at least a clear
  callout.
- Release-ready public package changes add or update a visible release-note or
  changelog entry.

## Fail criteria
- A public breaking change lands with no visible release-note entry.
- A public release is prepared with no consumer-facing changelog or release-note
  update.

## Do not flag
- Internal-only refactors.
- Experimental code not yet shipped as a stable contract.

## Confidence guidance
- `HIGH`: public breaking change is explicit and release notes are absent.
- `MEDIUM`: public impact is inferred from packaging or consumers.
- `LOW`: prefer `unknown` if external consumer scope is unclear.

## Remediation
- Add a breaking-change note and migration guidance to the package's release
  notes or changelog.

## Pass example
```markdown
## 3.0.0
- BREAKING: `IClient.Send` was removed. Use `IClient.SendAsync` instead.
```

## Fail example
```markdown
## 3.0.0
- Internal cleanup and improvements.
```
