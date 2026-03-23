# CSHARP-REL-001: Cancellation flows through async and long-running work

## Intent

Cancellation is part of correctness for networked and background systems. Work
that ignores cancellation keeps consuming compute, holding connections, and
delaying shutdown long after the caller has given up.

## Applicability

Applies to async I/O, background work, streaming, and any operation that may
outlive the initiating request.

Return `unknown` when the changed code is purely synchronous or trivially
bounded.

## Strategy

`heuristic`

## What to inspect

1. Find public async methods, handlers, workers, and loops introduced or
   changed in the diff.
2. Check whether they accept a `CancellationToken` when they form a boundary.
3. Check whether the token is forwarded to downstream async dependencies.

## Pass criteria

- Boundary methods accept a `CancellationToken` when cancellation is relevant.
- Downstream I/O and waits receive the caller's token.
- New linked tokens preserve the parent token.

## Fail criteria

- The code drops the incoming token and uses `CancellationToken.None`.
- Long-running loops or waits ignore available cancellation.
- A new `CancellationTokenSource` replaces, rather than links to, the parent
  token without a good reason.

## Do not flag

- Tiny private methods doing only synchronous CPU work.
- Signatures constrained by external interfaces where no token can be added,
  provided downstream cancellation is still honored where possible.
- One-shot methods whose work is provably immediate and in-memory.

## Evidence to collect

- The boundary method and its downstream call.
- The missing token pass-through or ignored cancellation path.

## Confidence guidance

- `HIGH`: the dropped token or ignored cancellation is directly visible.
- `MEDIUM`: cancellation likely matters, but the full call chain is partly out
  of scope.
- `LOW`: prefer `unknown` if the operation is too small to judge.

## Remediation

- Accept `CancellationToken` on relevant boundaries.
- Pass the token to downstream async calls and delays.
- Link child token sources to the caller token when adding time budgets.

## Pass example

```csharp
public Task<User?> GetAsync(Guid id, CancellationToken ct) =>
    _repository.GetAsync(id, ct);
```

## Fail example

```csharp
public Task<User?> GetAsync(Guid id, CancellationToken ct) =>
    _repository.GetAsync(id, CancellationToken.None);
```
