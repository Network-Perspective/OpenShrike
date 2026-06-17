---
id: rel-cpp-001
title: Resource ownership uses RAII with safe copy, move, and lifetime semantics
domain: rel
language: cpp
app-type: [any]
status: active
sources:
  - type: book
    title: A Tour of C++
    author: Bjarne Stroustrup
    year: 2018
  - type: standard
    title: C++ Core Guidelines
  - type: book
    title: Effective Modern C++
    author: Scott Meyers
    year: 2014
---

# rel-cpp-001: Resource ownership uses RAII with safe copy, move, and lifetime semantics

## Intent
Prevent leaks, double frees, dangling references, and moved-from misuse in C++ resource-owning code.

## Applicability
Applies to C++ classes owning resources, raw allocation, smart-pointer construction, and object lifetime boundaries.

## What to inspect
Copy and move operations, raw `new` or `delete`, returns of local aliases, smart-pointer construction, and moved-from object use.

## Pass criteria
Resource ownership is explicit and RAII-managed, ownership transfer is safe, and lifetimes are not escaped incorrectly.

## Fail criteria
The diff introduces naked ownership, shallow copies of owners, aliases to locals, duplicate `shared_ptr` control blocks, or use of moved-from values as meaningful state.

## Do not flag
Non-owning views whose lifetime is obviously shorter than the owning object.

## Confidence guidance
`HIGH` when the ownership bug is directly visible. `MEDIUM` when helper ownership is inferred. `LOW` when lifetime boundaries are incomplete.

## Remediation
Use RAII wrappers, define or delete owner copy operations, avoid escaping local lifetimes, and use smart-pointer factories correctly.

## Pass example
```cpp
auto p = std::make_unique<Foo>();
```

## Fail example
```cpp
return &local;
```
