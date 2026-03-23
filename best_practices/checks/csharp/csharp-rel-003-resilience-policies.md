# CSHARP-REL-003: Outbound dependencies have explicit resilience behavior

## Intent

Remote dependencies fail in transient ways. The code should make retry and
failure behavior explicit instead of relying on hope or accidental framework
defaults.

## Applicability

Applies when the diff introduces or materially changes outbound calls to HTTP
services, queues, caches, or other remote dependencies.

Return `unknown` when idempotency or retry safety cannot be established from
the available scope.

## Strategy

`heuristic`

## What to inspect

1. Find outbound clients introduced or changed in the diff.
2. Check whether timeout, retry, backoff, circuit-breaker, or equivalent policy
   behavior is configured.
3. Check whether retries are safe for the operation being retried.

## Pass criteria

- The outbound dependency has explicit transient-failure handling, or
- the code clearly documents or configures a deliberate no-retry choice because
  retries would be unsafe.

## Fail criteria

- A business-critical outbound dependency is introduced with no visible
  resilience behavior.
- Blind retries are added around non-idempotent operations.
- Retry behavior has no backoff or bound.

## Do not flag

- In-memory collaborators.
- One-off maintenance tools.
- Non-idempotent writes that intentionally avoid retry and still have timeouts
  and clear error handling.

## Evidence to collect

- The outbound client registration or call site.
- The configured resilience policy, or its absence.

## Confidence guidance

- `HIGH`: explicit retry misuse or total absence of resilience on a clear remote
  dependency is visible.
- `MEDIUM`: the dependency is remote, but safety of retry is partly inferred.
- `LOW`: prefer `unknown` if the criticality of the dependency is unclear.

## Remediation

- Add bounded retries with backoff and jitter where safe.
- Add a circuit breaker or equivalent failure isolation if the dependency is
  unstable or business-critical.
- Prefer an explicit no-retry decision over accidental default behavior.

## Pass example

```csharp
builder.Services.AddHttpClient("payments")
    .AddResilienceHandler("payments", builder =>
    {
        builder.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            BackoffType = DelayBackoffType.Exponential
        });
    });
```

## Fail example

```csharp
builder.Services.AddHttpClient("payments");
```

The client is a production dependency but the diff shows no timeout, retry, or
other resilience decision.
