# CSHARP-SEC-003: Insecure deserialization APIs are not used

## Intent

Dangerous serializers such as `BinaryFormatter` are a well-known remote code
execution and gadget-chain risk. New code should use safe serializers with
fixed contracts.

## Applicability

Applies when the code serializes or deserializes object graphs from persisted or
external data.

Return `unknown` when serialization code is referenced indirectly but the
implementation is not visible.

## Strategy

`static`

## What to inspect

1. Search for `BinaryFormatter`, `NetDataContractSerializer`, `LosFormatter`,
   `SoapFormatter`, and similar dangerous APIs.
2. Review custom deserialization that rehydrates runtime types from input.

## Pass criteria

- The code uses `System.Text.Json`, protobuf, MessagePack with safe settings, or
  another fixed-contract serializer.
- Type selection does not come from untrusted payload data.

## Fail criteria

- `BinaryFormatter` or equivalent insecure serializer is used.
- Deserialization relies on attacker-controlled type metadata.

## Do not flag

- Safe serializers with explicit DTO contracts.
- Internal model binding by ASP.NET Core.
- Pure serialization with no deserialization risk, unless the serializer itself
  is known-dangerous.

## Evidence to collect

- The insecure API usage.
- The input or persisted data path reaching it.

## Confidence guidance

- `HIGH`: the dangerous API is directly visible.
- `MEDIUM`: a wrapper likely hides the dangerous API, but only one side is in
  scope.
- `LOW`: prefer `unknown` if the serializer implementation is unseen.

## Remediation

- Replace the serializer with a safe fixed-contract alternative.
- Remove type-name-based deserialization.

## Pass example

```csharp
var json = JsonSerializer.Serialize(payload);
var result = JsonSerializer.Deserialize<OrderCreated>(json);
```

## Fail example

```csharp
var formatter = new BinaryFormatter();
var result = formatter.Deserialize(stream);
```
