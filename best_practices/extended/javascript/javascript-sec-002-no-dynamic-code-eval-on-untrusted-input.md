---
id: javascript-sec-002
title: Dynamic code evaluation is not fed by untrusted input
domain: sec
language: javascript
app-type: [any]
status: active
sources: []
---

# javascript-sec-002: Dynamic code evaluation is not fed by untrusted input

## Intent
`eval`, `new Function`, and equivalent dynamic execution paths collapse the boundary between data and code. They are especially dangerous when content is externally influenced.

## Applicability
Applies when the code dynamically evaluates JavaScript expressions, templates, or generated functions. Return `unknown` when the evaluated source is wrapped behind helpers out of scope.

## What to inspect
`eval`, `new Function`, `vm`, similar APIs, and whether externally influenced content reaches them.

## Pass criteria
Dynamic execution is avoided on untrusted paths, and any code generation uses fixed repository-owned source.

## Fail criteria
User-controlled or external content reaches `eval`, `new Function`, or equivalent runtime code execution.

## Do not flag
Build-time code generation outside runtime boundaries. Safe static lookup tables that replace dynamic evaluation.

## Confidence guidance
`HIGH` when untrusted content reaches dynamic evaluation directly. `MEDIUM` when the source is likely external but some flow is hidden. `LOW` when the evaluated source is opaque.

## Remediation
Replace dynamic execution with explicit dispatch or parsing.

## Pass example
```javascript
const handler = handlers[input.kind]
```

## Fail example
```javascript
const result = eval(req.body.expression)
```
