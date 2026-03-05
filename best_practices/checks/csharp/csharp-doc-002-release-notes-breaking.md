# CSHARP-DOC-002: Breaking changes captured in release notes

## Intent
Breaking changes should be documented for downstream consumers.

## Step-by-step evaluation
1. Identify breaking changes in the diff (public API changes).
2. Verify release notes or changelog entries exist.

## Pass example
```markdown
## 2.0.0
- BREAKING: Renamed `GetUser` to `GetUserAsync`.
```

## Fail example
```markdown
## 2.0.0
- Updated internals.
```
