---
id: test-008
title: Tests assert behavior through supported interfaces, not internals
domain: test
language: shared
app-type:
  - any
status: active
sources:
  - type: book
    title: Growing Object-Oriented Software, Guided by Tests
    author: Steve Freeman & Nat Pryce
  - type: article
    title: Practical Test Pyramid
    author: Ham Vocke
  - type: book
    title: Software Engineering at Google
    author: Titus Winters, Tom Manshreck, Hyrum Wright
  - type: book
    title: "Unit Testing: Principles, Practices, and Patterns"
    author: Vladimir Khorikov
  - type: book
    title: "xUnit Test Patterns: Refactoring Test Code"
    author: Gerard Meszaros
---

# test-008: Tests assert behavior through supported interfaces, not internals

## Intent
Tests that couple themselves to private structure or unofficial seams fail on harmless refactors while missing the supported behavior users actually rely on.

## Applicability
Applies when the diff adds or changes tests for code that has a supported public API, event, persisted effect, or boundary-visible result. Return `unknown` when the internal structure itself is the explicit contract.

## What to inspect
Review changed assertions and whether they inspect private fields, internal helpers, or unofficial seams instead of a supported result or effect.

## Pass criteria
Tests exercise the behavior through the supported public surface and assert the externally visible result, state, or emitted artifact.

## Fail criteria
The test's main evidence depends on private fields, internal collections, helper-only state, reflection into private methods, or lower layers that bypass the supported contract.

## Do not flag
Parser or codec tests where the returned structure is itself the contract, or white-box regressions where no stable external surface exists and that constraint is explicit.

## Confidence guidance
`HIGH` when the test directly inspects private implementation details. `MEDIUM` when the coupling is obvious but the supported surface is partly inferred. `LOW` when the intended contract is ambiguous.

## Remediation
Rewrite the test to use the supported public interface and assert the observable behavior instead.

## Pass example
```python
def test_render_message():
    assert MessageRenderer().render(Message('h', 'b', 'f')) == '<h1>h</h1><b>b</b><i>f</i>'
```

## Fail example
```python
def test_renderer_structure():
    renderer = MessageRenderer()
    assert type(renderer._sub_renderers[0]).__name__ == 'HeaderRenderer'
```
