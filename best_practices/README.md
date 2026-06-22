# Best practice library

The source of truth for what OpenShrike reviews. Every standard lives here as
versioned Markdown — **checks** describe a single reviewable rule, and
**policies** bundle checks into selectable sets. It is plain Markdown you can read, edit, and review in a
pull request.

`shrike init` reads the policies in this directory, resolves them to a set of
checks, and seeds those checks into the consuming repository under
`.openshrike/checks/`. `shrike scan` then executes those project-local checks
and produces findings with evidence, rationale, and remediation. This folder is
the catalog; `.openshrike/` is the per-repo selection.

## Layout

```
best_practices/
├── checks/        Baseline checks
│   ├── shared/      Cross-language foundation, grouped by domain (sec, rel, …)
│   ├── <language>/  Language-specific checks (go, csharp, python, rust, …)
│   └── doctrines/   Architecture-doctrine checks (clean-arch, vertical-slice)
├── extended/      Additional checks layered on top of the foundation,
│                  grouped by domain and language
└── policies/      Selectable bundles that reference checks by relative link
    ├── MANIFEST.md                    Index of every policy (excluded from selection)
    ├── baseline-shared-foundation.md Minimal cross-language starter
    ├── shared-foundation.md          Full cross-language foundation
    ├── baseline-lang-*.md            Minimal starter per language
    ├── lang-*.md                     Full per-language bundles
    └── doctrine-*.md                 Opt-in architecture overlays
```

## Anatomy of a check

Each check is one Markdown file with YAML frontmatter and a fixed set of
sections. The frontmatter identifies and classifies the check:

```yaml
---
id: sec-001                 # stable identifier referenced by policies
title: Untrusted input does not reach shell or process execution unsafely
domain: sec                 # api | arch-core | data | doc | ops | perf | rel | sec | test
language: shared            # shared, or a specific language
app-type: [any]             # e.g. [any], [http-service], [library]
status: active
sources: [...]              # books, articles, standards the rule draws on
---
```

The body follows a consistent shape so reviews stay predictable: **Intent**,
**Applicability**, **What to inspect**, **Pass criteria**, **Fail criteria**,
**Do not flag**, **Confidence guidance**, **Remediation**, and **Pass/Fail
examples**.

### Domains

`sec` (security), `rel` (reliability), `arch-core` (architecture), `test`,
`api`, `data`, `ops` (operations), `perf` (performance), and `doc`
(documentation).

## Policies

A policy is a Markdown file in `policies/` that selects checks. The loader
(`src/lib/policies.ts`) derives a policy's check set from the relative
`[check-id](../checks/…)` / `[check-id](../extended/…)` links in its body, so
the catalog and the rendered document never drift apart. Frontmatter:

```yaml
---
id: lang-go                 # selectable id (lower-cased when matched)
title: Go Language Policy
kind: language              # foundation | language | doctrine | manifest
includes: [shared-foundation]   # other policies whose checks are merged in
check-count: 77             # informational
---
```

- **`kind: manifest`** is excluded from selection — that is `MANIFEST.md`, the
  human-readable index of all policies.
- **`includes`** merges another policy's checks. Starter `baseline-lang-*`
  policies include `baseline-shared-foundation`; full `lang-*` policies include
  `shared-foundation`. Policies can also add their own direct checks on top of
  included policies.
- **`kind: doctrine`** policies are opt-in architecture overlays that carry
  only their doctrine checks (they do **not** include the foundation). Enable
  one on top of a language policy when the repo commits to that architecture.
  `doctrine-clean-arch` and `doctrine-vertical-slice` are alternatives — do not
  enable both.

`shrike init` auto-detects the project's languages (`src/lib/init/project-detect.ts`)
and proposes the matching `lang-*` policies; doctrine overlays are an explicit
opt-in.

## Adding or changing a standard

1. **Add a check.** Create `checks/<area>/<id>-<slug>.md` (or `extended/…` for a
   check layered beyond the foundation) using the frontmatter and section
   structure above. Keep the `id` stable — policies reference it.
2. **Reference it from a policy.** Add a `[<id>](../checks/…/<file>.md)` link to
   the relevant `policies/*.md` so the check is actually selected, and update
   that policy's `check-count`.
3. **Update the manifest.** When you add or remove a policy, update
   `policies/MANIFEST.md` (`policy-count` and the table row).
4. **Verify.** `npx vitest run tests/policies.test.ts` confirms the policies
   still resolve and the manifest stays excluded from selection.
