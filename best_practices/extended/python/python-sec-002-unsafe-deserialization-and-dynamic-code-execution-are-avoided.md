---
id: python-sec-002
title: Unsafe deserialization and dynamic code execution are avoided
domain: sec
language: python
app-type: [any]
status: active
sources: []
---

# python-sec-002: Unsafe deserialization and dynamic code execution are avoided

## Intent
Python makes it easy to turn data into executable behavior accidentally. `pickle`, unsafe YAML loaders, and direct `eval` or `exec` on external input are high-risk boundaries.

## Applicability
Applies when the code loads persisted objects, parses YAML, or executes dynamic expressions from external or semi-trusted input. Return `unknown` when the wrapper exists but its loader choice is out of scope.

## What to inspect
`pickle.load(s)`, `joblib.load`, `yaml.load`, `eval`, `exec`, and dynamic dispatch based on raw input.

## Pass criteria
Safe loaders or fixed-schema serializers are used, and dynamic execution does not consume untrusted input.

## Fail criteria
Untrusted or externally sourced data is deserialized with `pickle`, YAML uses unsafe loaders, or `eval` or `exec` consumes user-controlled content.

## Do not flag
Trusted offline tooling where input is repository-owned and isolated. Framework internals not fed by external input in the reviewed path.

## Confidence guidance
`HIGH` when unsafe API usage on external data is directly visible. `MEDIUM` when the loader is visible but trust level is inferred. `LOW` when the data source is unclear.

## Remediation
Replace with safe schema-driven serialization, use safe YAML loaders, and remove dynamic execution from untrusted paths.

## Pass example
```python
config = yaml.safe_load(text)
```

## Fail example
```python
config = yaml.load(text, Loader=yaml.Loader)
```
