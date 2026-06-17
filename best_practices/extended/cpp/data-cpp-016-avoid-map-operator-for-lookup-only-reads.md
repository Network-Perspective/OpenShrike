---
id: data-cpp-016
title: Avoid map::operator[] for lookup-only reads
domain: data
language: cpp
app-type: [any]
status: active
sources:
  - type: book
    title: A Tour of C++
    author: Bjarne Stroustrup
    year: 2018
    section: Section 11.4 map
---

# data-cpp-016: Avoid map::operator[] for lookup-only reads

## Intent
Prevent accidental insertion and mutation during C++ read-only map lookups.

## Applicability
Applies to `std::map` and similar associative containers in lookup-only code. Return `unknown` when mutation intent is unclear.

## What to inspect
`operator[]`, `find`, `contains`, `at`, and whether the lookup path is supposed to mutate the map.

## Pass criteria
Lookup-only reads use `find`, `contains`, or `at` instead of `operator[]`.

## Fail criteria
Read paths use `operator[]`, which inserts default values for missing keys.

## Do not flag
Intentional insert-or-update logic where insertion on miss is the desired behavior.

## Confidence guidance
`HIGH` when a read-only branch uses `operator[]`. `MEDIUM` when the caller might rely on insertion semantics. `LOW` when the lookup result is unused.

## Remediation
Use lookup APIs that do not mutate the container on a miss.

## Pass example
```cpp
if (auto it = counts.find(name); it != counts.end()) return it->second;
```

## Fail example
```cpp
return counts[name];
```
