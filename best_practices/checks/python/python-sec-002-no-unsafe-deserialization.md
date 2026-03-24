# PYTHON-SEC-002: Unsafe deserialization and dynamic code execution are avoided

## Intent

Python makes it easy to turn data into executable behavior accidentally.
`pickle`, unsafe YAML loaders, and direct `eval`/`exec` on external input are
high-risk boundaries.

## Applicability

Applies when the code loads persisted objects, parses YAML, or executes dynamic
expressions from external or semi-trusted input.

Return `unknown` when the deserialization wrapper exists but its loader choice is
out of scope.

## Strategy

`static`

## What to inspect

1. Search for `pickle.load(s)`, `joblib.load`, `yaml.load`, `eval`, `exec`, and
   dynamic import/dispatch based on raw input.
2. Determine whether the input can be influenced outside the current trust
   boundary.

## Pass criteria

- Safe loaders or fixed-schema serializers are used.
- Dynamic execution does not consume untrusted input.

## Fail criteria

- Untrusted or externally sourced data is deserialized with `pickle`.
- YAML is loaded with unsafe loaders.
- `eval` or `exec` consumes user-controlled content.

## Do not flag

- Trusted offline tooling where input is repository-owned and isolated.
- Framework internals not fed by external input in the reviewed path.

## Evidence to collect

- The unsafe API.
- The input path reaching it.

## Confidence guidance

- `HIGH`: unsafe API usage on external data is directly visible.
- `MEDIUM`: the loader is visible, but trust level is partly inferred.
- `LOW`: prefer `unknown` if the data source is unclear.

## Remediation

- Replace with safe schema-driven serialization.
- Use safe YAML loaders.
- Remove dynamic execution from untrusted paths.
