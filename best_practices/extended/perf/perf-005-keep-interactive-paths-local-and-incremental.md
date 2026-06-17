---
id: perf-005
title: Keep interactive paths local and incremental
domain: perf
language: shared
app-type: [any]
status: active
sources:
  - type: article
    title: Reflections on software performance
    author: Nelson Elhage
---

# perf-005: Keep interactive paths local and incremental

## Intent
Prevent interactive tools and request-per-action workflows from becoming too slow to use iteratively.

## Applicability
Applies when the diff changes code for an interactive or latency-sensitive path such as search, autocomplete, typechecking, lint-on-save, request validation, or another path that runs once per user action. Return `unknown` if the changed code is only for batch jobs, full rebuild commands, offline indexing, or other workflows that are not used interactively.

## What to inspect
Changed handlers, analyzers, indexing code, invalidation logic, loops over repository or dataset contents, and nearby docs or tests that show whether the path is intended to provide fast incremental feedback.

## Pass criteria
Direct evidence shows the path scopes work to the changed file, current query, affected partition, or another local subset, or otherwise maintains an incremental index or reusable state so each interaction avoids full recomputation.

## Fail criteria
The diff makes an interactive path rescan the entire repository, reload the full dataset, or rerun a global analysis pass on every invocation, with no repository evidence that the operation is intentionally a full rebuild step rather than an interactive action.

## Do not flag
Do not flag explicit full-build commands, one-time indexing jobs, migrations, admin backfills, or startup precomputation done before the interactive path begins serving requests. Do not flag tiny fixed-size inputs where the repository clearly bounds the work to a small constant.

## Confidence guidance
`HIGH` when the diff directly shows a per-invocation full scan or global recomputation in an interactive handler. `MEDIUM` when the path is clearly latency-sensitive, but some of the global work is hidden behind helpers. `LOW` when whether the code is actually interactive must be inferred from weak repository context.

## Remediation
Scope the work to the current change or query, or maintain an incremental index so the interactive path avoids full recomputation.

## Pass example
```python
def update_symbol_index(changed_file: Path) -> None:
    ast = parse_file(changed_file)
    symbol_index[changed_file] = extract_symbols(ast)
```

## Fail example
```python
def update_symbol_index(changed_file: Path) -> None:
    for path in repo_root.glob("**/*.py"):
        ast = parse_file(path)
        symbol_index[path] = extract_symbols(ast)
```
