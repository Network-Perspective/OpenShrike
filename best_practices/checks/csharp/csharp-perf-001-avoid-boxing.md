# CSHARP-PERF-001: Proven hot paths avoid avoidable boxing

## Intent

Boxing matters in allocation-sensitive loops, serializers, parsers, and other
hot paths. It does not matter enough to justify noise in ordinary business
code.

## Applicability

Applies only when the changed code is clearly performance-sensitive, for
example:

- the PR claims a performance goal,
- the code is inside a parser, serializer, logging adapter, or tight loop, or
- benchmark/profiler evidence in the repo identifies the path as hot.

Return `unknown` otherwise.

## Strategy

`heuristic`

## What to inspect

1. Look for value types being converted to `object` or non-generic interfaces
   inside loops or hot code.
2. Check whether the code runs per item, per request, or at very high volume.

## Pass criteria

- The hot path keeps value types generic or span-friendly where reasonable.

## Fail criteria

- The diff introduces repeated boxing in a clearly hot path with no reason.

## Do not flag

- Ordinary application logic.
- A single boxing allocation outside a hot loop.
- Readability-first code with no evidence of performance sensitivity.

## Evidence to collect

- The boxing site.
- The reason the path qualifies as hot.

## Confidence guidance

- `HIGH`: repeated boxing inside a clearly hot loop is directly visible.
- `MEDIUM`: the path appears performance-sensitive, but throughput importance is
  inferred.
- `LOW`: prefer `unknown` if hot-path evidence is weak.

## Remediation

- Use generics, spans, or strongly typed overloads.
- Keep the optimization local to the hot path.

## Pass example

```csharp
for (var i = 0; i < values.Length; i++)
{
    total += values[i];
}
```

## Fail example

```csharp
for (var i = 0; i < values.Length; i++)
{
    object current = values[i];
    sink.Write(current);
}
```
