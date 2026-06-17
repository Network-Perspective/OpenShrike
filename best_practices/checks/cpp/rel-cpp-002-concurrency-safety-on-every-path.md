---
id: rel-cpp-002
title: Locks, waits, atomics, and threads preserve concurrency safety on every path
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

# rel-cpp-002: Locks, waits, atomics, and threads preserve concurrency safety on every path

## Intent
Prevent deadlocks, lost wakeups, data races, and abrupt thread termination in C++ concurrency code.

## Applicability
Applies to locks, condition variables, atomics, `std::async`, and `std::thread` lifetime management.

## What to inspect
Lock guards, callbacks under lock, condition-variable predicates, atomic vs volatile usage, thread joins, and launch policies.

## Pass criteria
Locking is scoped, waits use predicates, atomics carry the synchronization, and threads are joined or detached on every exit path.

## Fail criteria
The diff adds manual unlocking, wait-without-predicate, `volatile`-as-sync, callbacks under lock, deferred `std::async` where real concurrency is assumed, or joinable-thread destruction.

## Do not flag
Single-threaded code and fixed-lifetime threads visibly joined by the same scope.

## Confidence guidance
`HIGH` when the concurrency hazard is directly visible. `MEDIUM` when ownership is partly inferred. `LOW` when thread lifetime is incomplete.

## Remediation
Use scoped locks, predicate waits, atomics for synchronization, and explicit thread lifetime cleanup.

## Pass example
```cpp
std::lock_guard<std::mutex> lock(mu);
```

## Fail example
```cpp
mu.lock();
```
