---
id: doc-kotlin-001
title: Public Kotlin library members are documented with KDoc
domain: doc
language: kotlin
app-type: [library]
status: active
sources:
  - type: documentation
    title: Kotlin Coding Conventions
    section: Coding conventions for libraries
---

# doc-kotlin-001: Public Kotlin library members are documented with KDoc

## Intent
Prevent public Kotlin library APIs from becoming hard to use or easy to misuse
because consumers cannot determine behavior, expectations, or side effects from
the declaration alone.

## Applicability
Applies only to Kotlin modules that are clearly intended to be reusable
libraries and to changed public members within those modules. Return `unknown`
for application code, internal-only modules, or declarations whose effective
visibility is not public.

## What to inspect
Inspect changed public classes, interfaces, objects, functions, properties, and
type aliases in library modules, and check whether adjacent KDoc documents the
member.

## Pass criteria
- Changed public library members have KDoc, unless they are simple overrides
  that add no new semantics beyond the inherited contract.

## Fail criteria
- A changed public library member is introduced or materially modified without
  KDoc, and it is not a simple override covered by inherited documentation.

## Do not flag
- Private or internal members.
- Generated code.
- Test-only code.
- Overrides that do not require new documentation.
- Non-library repositories.

## Confidence guidance
- `HIGH`: the diff shows a public library declaration with no adjacent KDoc.
- `MEDIUM`: the declaration appears public but the module's publishing role is
  inferred indirectly.
- `LOW`: visibility or library status is unclear.

## Remediation
- Add concise KDoc describing the public member's behavior, inputs, outputs,
  and important side effects or constraints.

## Pass example
```kotlin
/**
 * Parses a bearer token and returns its claims.
 */
public fun parse(token: String): Claims = decoder.decode(token)
```

## Fail example
```kotlin
public fun parse(token: String): Claims = decoder.decode(token)
```
