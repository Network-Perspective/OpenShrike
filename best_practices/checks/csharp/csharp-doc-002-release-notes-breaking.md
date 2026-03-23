# CSHARP-DOC-002: Public breaking changes are called out in release notes

## Intent

Consumers should not discover breaking changes by accident. If a versioned
package or public contract changes incompatibly, the release notes should say
so explicitly.

## Applicability

Applies only to externally versioned libraries, SDKs, or public API contracts.

Return `unknown` for internal-only services or when release-note ownership is
not visible.

## Strategy

`reasoning`

## What to inspect

1. Identify breaking changes to public APIs or documented contracts.
2. Look for changelog or release-note updates in the diff or nearby release
   files.

## Pass criteria

- Breaking changes are documented with migration guidance or at least a clear
  callout.

## Fail criteria

- A public breaking change lands with no visible release-note entry.

## Do not flag

- Internal-only refactors.
- Experimental code not yet shipped as a stable contract.

## Evidence to collect

- The breaking public change.
- The absence of release-note documentation.

## Confidence guidance

- `HIGH`: public breaking change is explicit and release notes are absent.
- `MEDIUM`: public impact is inferred from packaging or consumers.
- `LOW`: prefer `unknown` if external consumer scope is unclear.

## Remediation

- Add a breaking-change note and migration guidance.

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
