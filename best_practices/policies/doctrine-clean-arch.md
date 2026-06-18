---
id: doctrine-clean-arch
title: Clean Architecture Doctrine
kind: doctrine
check-count: 3
---

# Policy: Clean Architecture Doctrine

Architecture doctrine overlay for repositories that follow Clean / Hexagonal Architecture. It adds checks that keep business rules in explicit use cases, keep boundary ports owned by the inner policy layer, and keep boundary data framework-free. Enable it on top of the relevant `lang-*` (or `shared-foundation`) policy when the repository commits to this architecture; do not enable it together with `doctrine-vertical-slice`, which expresses an alternative doctrine.

## Doctrine Checks

### Any app type
- [clean-arch-002](../checks/doctrines/arch-clean-arch/clean-arch-002-explicit-use-cases.md) — Application business rules live in explicit use cases.
- [clean-arch-003](../checks/doctrines/arch-clean-arch/clean-arch-003-inner-policy-layer-owns-boundary-ports.md) — Boundary ports are owned by the inner policy layer.
- [clean-arch-004](../extended/arch-clean-arch/clean-arch-004-boundary-data-is-simple-isolated-and-framework-free.md) — Boundary data is simple, isolated, and framework-free.
