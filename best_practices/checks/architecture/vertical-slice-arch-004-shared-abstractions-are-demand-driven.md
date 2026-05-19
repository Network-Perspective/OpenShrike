# VERTICAL-SLICE-ARCH-004: Shared abstractions are extracted only with evidence

## Intent

Vertical Slice Architecture avoids rebuilding a horizontal architecture through
premature shared services, repositories, managers, or base classes. Shared
abstractions should exist because multiple slices demonstrably need the same
stable behavior, not because a single slice feels too large.

## Applicability

Applies when the diff adds or materially expands shared, common, base, or
application-wide abstractions in a slice-oriented repository.

Return `unknown` when:

- the repository is not clearly slice-oriented,
- the shared abstraction predates the diff and is not meaningfully changed, or
- the visible scope does not show enough call sites to judge reuse.

## Strategy

`reasoning`

## What to inspect

1. Review new or expanded shared modules, base classes, generic services, or
   repositories.
2. Determine how many slices actually use the abstraction and whether that use
   is stable and conceptually the same.
3. Separate true platform or infrastructure seams from business abstractions
   that merely centralize convenience.

## Pass criteria

- The extracted shared code is used by multiple slices with a clear common
  behavior, or
- the abstraction is infrastructure-level and not a disguised horizontal
  business layer.

## Fail criteria

- A new shared service, repository, manager, or base type is introduced for one
  slice or one narrow behavior.
- The diff creates a generic cross-cutting business layer that pulls behavior
  out of slices without evidence of repeated need.

## Do not flag

- Stable platform adapters, framework glue, or low-level utility modules.
- Code generation output.
- Shared domain primitives that are genuinely common across slices.

## Evidence to collect

- The new shared abstraction.
- The slices that use it, if any.
- Signs that the abstraction exists for convenience rather than repeated need.

## Confidence guidance

- `HIGH`: the diff introduces the abstraction and only one slice is using it.
- `MEDIUM`: there may be more reuse outside scope, but the visible evidence
  still suggests premature extraction.
- `LOW`: prefer `unknown` when actual reuse cannot be established.

## Remediation

- Keep the behavior in the owning slice until multiple slices need the same
  stable logic.
- Extract a narrower utility or contract instead of a broad shared layer.
- Reserve shared modules for proven infrastructure or cross-slice concerns.
