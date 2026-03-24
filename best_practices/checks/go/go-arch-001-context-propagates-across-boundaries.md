# GO-ARCH-001: Context propagates across request and I/O boundaries

## Intent

`context.Context` is part of correctness in Go services. Dropping it breaks
deadlines, cancellation, tracing, and request scoping.

## Applicability

Applies to handlers, RPC methods, background tasks, database calls, and outbound
I/O in Go code.

Return `unknown` when the changed code is purely synchronous and in-memory.

## Strategy

`heuristic`

## What to inspect

1. Review changed public functions and I/O calls.
2. Check whether incoming `context.Context` is accepted where relevant and
   passed to downstream operations.

## Pass criteria

- Relevant boundaries accept and forward `context.Context`.

## Fail criteria

- Incoming context is dropped and replaced with `context.Background()` or
  `context.TODO()` in normal request flow.
- I/O APIs that accept context are called without forwarding the caller context.

## Do not flag

- Tiny pure helper functions.
- Legitimate root contexts in true entry points such as `main`.

## Evidence to collect

- The boundary function.
- The dropped or replaced context in downstream calls.

## Confidence guidance

- `HIGH`: the caller context is directly discarded.
- `MEDIUM`: downstream APIs likely accept context, but full signatures are not
  shown.
- `LOW`: prefer `unknown` if no real I/O boundary is visible.

## Remediation

- Accept `context.Context` on relevant boundaries.
- Forward it through downstream calls.
