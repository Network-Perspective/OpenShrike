# JAVA-SEC-001: Native Java deserialization is not used on untrusted data

## Intent

Java native deserialization has a long history of gadget-based remote code
execution issues. New code should not deserialize untrusted bytes into arbitrary
object graphs.

## Applicability

Applies when the code deserializes persisted or external object streams or uses
serialization-based remoting patterns.

Return `unknown` when wrapper abstractions hide the serializer choice.

## Strategy

`static`

## What to inspect

1. Review `ObjectInputStream`, Java serialization APIs, XML decoders, and
   equivalent object-graph deserialization.
2. Check whether external or semi-trusted input reaches them.

## Pass criteria

- External data is parsed through safe, schema-driven formats.

## Fail criteria

- Untrusted data is deserialized with native Java serialization or equivalent
  unsafe object-graph loaders.

## Do not flag

- Repository-owned offline maintenance tools with isolated inputs.
- Safe JSON/XML binding on fixed DTO types.

## Evidence to collect

- The unsafe deserialization API.
- The input path reaching it.

## Confidence guidance

- `HIGH`: unsafe deserialization on external data is directly visible.
- `MEDIUM`: the loader is visible, but trust level is partly inferred.
- `LOW`: prefer `unknown` if the data source is unclear.

## Remediation

- Replace with schema-driven serialization.
- Remove object-graph deserialization from untrusted paths.
