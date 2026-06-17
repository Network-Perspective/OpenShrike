---
id: vertical-slice-arch-004
title: Shared abstractions are extracted only with real evidence
domain: arch
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: A Philosophy of Software Design
    author: John Ousterhout
  - type: article
    title: Vertical Slice / Coupling / Cohesion
    author: Derek Comartin
  - type: article
    title: Code Review Developer Guide
    author: Google Engineering Practices
---

# vertical-slice-arch-004: Shared abstractions are extracted only with real evidence

## Intent
Do not rebuild a horizontal architecture through premature shared services, repositories, managers, or feature-specific abstractions extracted for only one slice.

## Applicability
Applies when the diff adds or materially expands shared/common abstractions in a slice-oriented repo.

## What to inspect
New shared modules, their call sites, and whether the shared layer adds real cross-slice reuse or only convenience.

## Pass criteria
The extracted abstraction is used by multiple slices or is genuine infrastructure-level glue.

## Fail criteria
The diff creates a shared service, repository, manager, or base class for one slice or one narrow behavior.

## Do not flag
Stable framework adapters, low-level utilities, and genuine cross-cutting infrastructure.

## Confidence guidance
`HIGH` when the new shared type has one visible slice consumer. `MEDIUM` when reuse might exist elsewhere but the visible evidence is still weak. `LOW` when usage cannot be established.

## Remediation
Keep the behavior local to its slice until a second real consumer exists; only extract the smallest shared seam already justified by visible cross-slice reuse or genuine infrastructure needs.

## Pass example
```csharp
public interface IClock { DateTime UtcNow { get; } }
```

## Fail example
```csharp
namespace Shared.Services;
public sealed class RegisterUserService { }
```
