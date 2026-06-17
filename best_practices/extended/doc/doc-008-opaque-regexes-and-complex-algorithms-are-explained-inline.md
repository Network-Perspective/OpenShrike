---
id: doc-008
title: Opaque regexes and complex algorithms are explained inline
domain: doc
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Google Engineering Practices Code Review Developer Guide
---

# doc-008: Opaque regexes and complex algorithms are explained inline

## Intent
Prevent maintenance bugs caused by future engineers misreading dense regular
expressions or non-obvious algorithmic code. Opaque logic without rationale
makes safe modification unnecessarily risky.

## Applicability
Applies when the diff adds or substantially changes a regular expression,
parsing rule, bit-level manipulation, or other dense algorithm whose intent is
not obvious from the code alone.

Return `unknown` if the logic is straightforward or if the explanation already
lives in a clearly linked spec or generated source.

## What to inspect
Changed regex literals, parser tables, compact algorithmic loops, and nearby
comments or docs that explain the purpose, invariants, or constraints of the
logic.

## Pass criteria
- The diff includes an adjacent comment or doc reference that explains why the
  regex or algorithm exists and what constraint or invariant it is preserving.

## Fail criteria
- The diff adds an opaque regex or complex algorithm with no local explanation
  of its purpose or constraints.

## Do not flag
- Small self-explanatory conditionals.
- Straightforward loops.
- Simple regexes whose meaning is obvious at a glance.
- Generated parsers or code copied from a referenced standard when the source
  reference is already present nearby.

## Confidence guidance
- `HIGH`: the added code is dense and symbolic enough that its intent is not
  recoverable quickly, and no explanatory comment or reference is present.
- `MEDIUM`: the code is moderately complex but some intent can be inferred from
  naming.
- `LOW`: complexity is borderline and reasonable reviewers could disagree.

## Remediation
- Add a short inline comment that explains the intent, key invariant, or
  external rule the regex or algorithm is enforcing.

## Pass example
```javascript
// Match stable semver tags only; prereleases are rejected by the release policy.
const versionPattern = /^\d+\.\d+\.\d+$/
```

## Fail example
```javascript
const versionPattern = /^\d+\.\d+\.\d+$/
```
