# CSHARP-TEST-004: Large JSON contracts are asserted as whole documents

## Intent

When a test cares about a serialized contract, it should review the contract as
a whole document, not through a handful of brittle substring checks. Snapshot
or semantic whole-document assertions make contract drift visible.

## Applicability

Applies when tests verify large or externally consumed JSON payloads.

Return `unknown` when:

- the payload is small and targeted assertions are clearer, or
- the test is not about the serialized contract.

## Strategy

`heuristic`

## What to inspect

1. Find tests asserting serialized JSON or HTTP payload bodies.
2. Determine whether the test is covering the full contract or only a few
   fragments.

## Pass criteria

- The test uses snapshot/approval review, or
- it parses the JSON and asserts semantic equivalence across the full relevant
  structure.

## Fail criteria

- A large payload is "tested" with a few `Contains(...)` string assertions.
- Contract-critical fields can change without the test noticing.

## Do not flag

- Small DTOs with a few targeted fields.
- Tests intentionally checking only one field-level concern.
- Binary or non-JSON payloads.

## Evidence to collect

- The serialization site.
- The narrow assertion pattern.

## Confidence guidance

- `HIGH`: the test clearly asserts only fragments of a large contract.
- `MEDIUM`: the contract size or consumer importance is partly inferred.
- `LOW`: prefer `unknown` when the payload scope is unclear.

## Remediation

- Use an approval/snapshot mechanism, or
- deserialize and assert structural equivalence of the full relevant payload.

## Pass example

```csharp
var json = JsonSerializer.Serialize(result);
json.Should().MatchApproved();
```

## Fail example

```csharp
var json = JsonSerializer.Serialize(result);
json.Should().Contain("\"status\":\"ok\"");
json.Should().Contain("\"total\":42");
```
