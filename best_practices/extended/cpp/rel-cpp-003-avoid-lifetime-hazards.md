---
id: rel-cpp-003
title: Constructors, globals, and escaping lambdas avoid lifetime hazards
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
  - type: standard
    title: Google C++ Style Guide
  - type: book
    title: Effective Modern C++
    author: Scott Meyers
    year: 2014
---

# rel-cpp-003: Constructors, globals, and escaping lambdas avoid lifetime hazards

## Intent
Prevent construction-time and shutdown-time lifetime bugs that appear only under particular ordering or escaping conditions.

## Applicability
Applies to constructors, static and thread-local lifetime, base-class destruction, and lambdas that escape their defining scope.

## What to inspect
Virtual calls in constructors, non-local initialization, virtual destructors, dynamic `thread_local`, and default lambda captures that escape.

## Pass criteria
Construction and global lifetime are deterministic, polymorphic destruction is correct, and escaping lambdas capture explicitly with safe lifetimes.

## Fail criteria
The diff adds global lifetime order hazards, missing virtual destructors for polymorphic bases, virtual calls from constructors, or escaping default captures that can dangle.

## Do not flag
Short-lived local lambdas that do not escape scope.

## Confidence guidance
`HIGH` when the lifetime hazard is directly visible. `MEDIUM` when escape or global lifetime is inferred. `LOW` when ownership is partial.

## Remediation
Keep global init simple, give polymorphic bases virtual destructors, avoid virtual dispatch in constructors, and capture explicitly for escaping lambdas.

## Pass example
```cpp
auto cb = [value = shared_ptr<Foo>(foo)] { value->run(); };
```

## Fail example
```cpp
auto cb = [=] { use(local_ref); };
```
