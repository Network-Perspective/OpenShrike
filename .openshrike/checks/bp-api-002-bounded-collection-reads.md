# BP-API-002: Collection reads are bounded

## Intent

External interfaces should not accidentally expose unbounded collection reads.
Explicit limits protect latency, memory use, and downstream storage pressure.

## Applicability

Applies to external endpoints or commands that return collections whose size can
grow beyond a small fixed set.

Return `unknown` when the dataset size is inherently fixed or not visible.

## Strategy

`heuristic`

## What to inspect

1. Review changed list or search endpoints.
2. Check whether paging, cursoring, or explicit caps are in place.

## Pass criteria

- The interface bounds the number of items returned.
- Client-supplied limits have a safe maximum.

## Fail criteria

- An external endpoint returns an unbounded collection.
- Client-controlled page size has no upper bound.

## Do not flag

- Fixed-size reference data.
- Explicit export flows that are separately gated and documented.

## Evidence to collect

- The unbounded collection path.
- The missing bound or missing maximum.

## Confidence guidance

- `HIGH`: unbounded collection behavior is directly visible.
- `MEDIUM`: the dataset growth potential is inferred.
- `LOW`: prefer `unknown` if the collection is likely fixed-size.

## Remediation

- Add pagination, cursoring, or explicit limits.
- Enforce a maximum page size.
