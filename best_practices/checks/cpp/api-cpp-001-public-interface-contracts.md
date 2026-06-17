---
id: api-cpp-001
title: C++ public interfaces express dispatch, ownership, and range contracts explicitly
domain: api
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

# api-cpp-001: C++ public interfaces express dispatch, ownership, and range contracts explicitly

## Intent
C++ interfaces become fragile when callers must infer conversions, overriding, ownership, nullability, or range length from conventions instead of declarations.

## Applicability
Applies when the diff changes public C++ constructors, virtual methods, function signatures, pointer or span boundaries, or class copy or move behavior.

## What to inspect
Converting constructors and operators, `override` markers, pointer and size pairs, ownership transfer through raw pointers, nullability annotations, copy and move declarations, default arguments on virtual methods, and universal-reference overload sets.

## Pass criteria
Public interfaces make conversions and overrides explicit, express ranges and ownership with types rather than raw pointer conventions where possible, make nullability and copy or move semantics obvious, and avoid declaration patterns whose runtime meaning differs from the call site.

## Fail criteria
A public API adds an implicit conversion, omits `override` on an intended override, uses raw pointer plus size where a span or view is the real contract, transfers ownership ambiguously with raw pointers, depends on null or copy semantics callers cannot tell from the declaration, or mixes default arguments with virtual dispatch.

## Do not flag
C ABIs, single-object non-owning pointers with obvious lifetime, generated bindings, or value-like wrapper types whose implicit conversion is already the deliberate contract.

## Confidence guidance
`HIGH` when the declaration itself hides the contract. `MEDIUM` when ownership or lifetime is inferred from nearby code. `LOW` when part of the interface lives in generated or macro-expanded code.

## Remediation
Use explicit declarations and richer boundary types so ownership, range, dispatch, and conversion behavior are visible in the interface itself.

## Pass example
```cpp
class Widget {
public:
  explicit Widget(std::string_view name);
  void set_items(std::span<const Item> items);
  virtual void refresh() override;
};
```

## Fail example
```cpp
class Widget {
public:
  Widget(const char* name);
  virtual void refresh(int mode = 1);
  void set_items(Item* items, int count);
};
```
