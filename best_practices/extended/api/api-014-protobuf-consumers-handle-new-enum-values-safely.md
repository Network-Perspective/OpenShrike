---
id: api-014
title: In-repo protobuf consumers handle newly added enum values safely
domain: api
language: shared
app-type: [any]
status: active
sources:
  - type: documentation
    title: Buf documentation - breaking-change rules for protobuf
---

# api-014: In-repo protobuf consumers handle newly added enum values safely

## Intent
When producers add enum values, consumers in the same repository should not crash or mis-handle the message because they assumed the old set was closed.

## Applicability
Applies when the diff adds a value to a protobuf enum and the repository contains consumers that branch on that enum.

## What to inspect
Enum additions, switch statements, exhaustive matches, default or unknown branches, and tests for unrecognized values.

## Pass criteria
Consumers already tolerate unknown or new values, or the same change updates exhaustive handling paths to keep behavior safe.

## Fail criteria
A new enum value is added but in-repo consumers still assume the prior finite set with no fallback path.

## Do not flag
Schema-only repositories with no visible consumers, or code paths that already route unknown enum values through a safe default.

## Confidence guidance
`HIGH` when both the enum addition and an exhaustive consumer are visible. `MEDIUM` when consumer handling is inferred from helper names. `LOW` when downstream consumers live outside the repo.

## Remediation
Add a default or unknown branch and update in-repo consumers before introducing new enum values.

## Pass example
```protobuf
enum State {
  STATE_UNSPECIFIED = 0;
  READY = 1;
  PAUSED = 2;
}
```

## Fail example
```java
switch (state) {
  case READY: ...
}
```
