---
id: doctrine-vertical-slice
title: Vertical Slice Architecture Doctrine
kind: doctrine
check-count: 3
---

# Policy: Vertical Slice Architecture Doctrine

Architecture doctrine overlay for repositories organized around vertical slices. It adds checks that keep each new use case inside an owning slice, keep changes local to that slice, and resist premature shared abstractions. Enable it on top of the relevant `lang-*` (or `shared-foundation`) policy when the repository commits to this architecture; do not enable it together with `doctrine-clean-arch`, which expresses an alternative doctrine.

## Doctrine Checks

### Any app type
- [vertical-slice-arch-001](../checks/doctrines/arch-vertical-slice/vertical-slice-arch-001-owning-slice.md) — New use cases land inside an owning slice.
- [vertical-slice-arch-002](../checks/doctrines/arch-vertical-slice/vertical-slice-arch-002-slice-changes-stay-local.md) — Slice changes stay local to the use case.
- [vertical-slice-arch-004](../checks/doctrines/arch-vertical-slice/vertical-slice-arch-004-shared-abstractions-are-extracted-only-with-real-evidence.md) — Shared abstractions are extracted only with real evidence.
