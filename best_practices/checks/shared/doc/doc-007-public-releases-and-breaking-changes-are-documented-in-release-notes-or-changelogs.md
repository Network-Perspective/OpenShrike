---
id: doc-007
title: Public releases and breaking changes are documented in release notes or changelogs
domain: doc
language: shared
app-type:
  - library
  - cli
  - http-service
status: active
sources:
  - type: standard
    title: Keep a Changelog
---

# doc-007: Public releases and breaking changes are documented in release notes or changelogs

## Intent
Consumers should not discover releases, breaking changes, deprecations, or
removals by accident. If a versioned package or public contract changes, the
release notes should say so explicitly.

## Applicability
Applies only to externally versioned libraries, SDKs, CLIs, or public API
contracts when the diff bumps a version, prepares a release, changes release
automation, or deprecates, removes, or breaks a public contract.

Return `unknown` for internal-only services or when release-note ownership is
not visible.

## What to inspect
Changed package manifests, release scripts, changelog or release-note files,
public API or CLI changes, and whether breaking or deprecated behavior is
called out for consumers.

## Pass criteria
- A user-facing changelog or release-note entry exists for the released version
  or release-ready change.
- Breaking, deprecated, or removed public behavior is explicitly called out, and
  migration guidance is present when the change is materially breaking.

## Fail criteria
- A public release or version bump lands with no visible changelog or release
  note entry.
- A breaking, deprecated, or removed public contract lands with no explicit
  release-note callout.

## Do not flag
- Internal-only refactors.
- Experimental code not yet shipped as a stable contract.
- Docs-only or CI-only changes that do not represent a release or contract
  change.

## Confidence guidance
- `HIGH`: public release or breaking change is explicit and release notes are
  absent.
- `MEDIUM`: public impact is inferred from packaging or consumers.
- `LOW`: prefer `unknown` if external-consumer scope is unclear.

## Remediation
- Add or update a user-facing changelog or release-note entry, and call out
  breaking, deprecated, or removed behavior explicitly.

## Pass example
```markdown
## 3.0.0
- BREAKING: `IClient.Send` was removed. Use `IClient.SendAsync` instead.
- Added cursor pagination to list operations.
```

## Fail example
```markdown
## 3.0.0
- Internal cleanup and improvements.
```
