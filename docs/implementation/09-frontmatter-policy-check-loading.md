## Goal

Make OpenShrike load the rebuilt bundled best-practices library from repository content instead of assuming the previous filename and policy layout.

## Problem

- Bundled policy resolution still assumes old `*-baseline` policy ids.
- Bundled check resolution still assumes check ids match markdown file names under `best_practices/checks/**`.
- The rebuilt library now stores check and policy metadata in markdown frontmatter.
- Language policies now reference checks across both `best_practices/checks/**` and `best_practices/extended/**`.
- The policy catalog currently treats every markdown file under `best_practices/policies/**` as selectable, including the manifest.

## Implementation Plan

1. Add a small markdown frontmatter reader for the YAML subset used by the bundled best-practices library.
2. Switch bundled check discovery from filename lookup to metadata lookup by scanning `best_practices/**` and reading each check id/title from frontmatter.
3. Keep project-local `.openshrike/checks` compatibility by falling back to filename and heading parsing when a custom check has no frontmatter.
4. Switch bundled policy discovery to frontmatter metadata, filter out non-selectable entries such as the manifest, and prefer an explicit `checks` list when present.
5. Keep a fallback path for policies without explicit `checks` metadata by extracting linked check ids from policy markdown.
6. Update init project detection defaults and adjacent-policy ranking from the removed `*-baseline` ids to the new `lang-*` policy ids.
7. Refresh CLI examples and real-data tests to use stable bundled policies and checks that exist in the rebuilt library.
8. Add regression coverage for frontmatter-based check resolution, policy loading, and init seeding.

## Notes

- The loader should discover bundled content from `best_practices/` rather than maintaining a hardcoded policy or check list in TypeScript.
- Policy `checks` frontmatter remains optional so the library can migrate incrementally without breaking the tool.
