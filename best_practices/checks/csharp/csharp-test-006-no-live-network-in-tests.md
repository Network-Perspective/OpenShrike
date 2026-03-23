# CSHARP-TEST-006: Default tests do not depend on live network services

## Intent

Tests should be hermetic by default. Reaching live services makes results slow,
flaky, expensive, and environment-dependent.

## Applicability

Applies to unit, integration, and contract tests in the normal CI path.

Return `unknown` when the repository's test taxonomy is not visible.

## Strategy

`heuristic`

## What to inspect

1. Search test code for real URLs, cloud SDK clients, sockets, or DNS names.
2. Determine whether the tests talk to live services or to local emulators,
   test servers, or containers.
3. Check whether genuinely external tests are clearly isolated and opt-in.

## Pass criteria

- Tests use `TestServer`, mocks, WireMock, Testcontainers, local emulators, or
  equivalent hermetic dependencies.
- External-system tests are explicitly marked and excluded from the default
  fast path.

## Fail criteria

- Ordinary test runs call real HTTP endpoints or cloud resources.
- Tests depend on developer secrets or ambient credentials.
- A test suite assumes internet access for routine execution.

## Do not flag

- Loopback or local-container endpoints.
- Dedicated end-to-end suites that are clearly separated from the normal PR
  path.
- Tests that verify HTTP behavior against an in-process server.

## Evidence to collect

- The test making the live network call.
- The real endpoint or ambient credential usage.

## Confidence guidance

- `HIGH`: the test directly targets a real remote host or cloud resource.
- `MEDIUM`: network access is visible, but isolation might exist outside scope.
- `LOW`: prefer `unknown` if the endpoint ownership is unclear.

## Remediation

- Replace live dependencies with mocks, fakes, or local containers.
- Move true end-to-end tests into an explicitly gated suite.

## Pass example

```csharp
await using var api = new WebApplicationFactory<Program>();
var client = api.CreateClient();
```

## Fail example

```csharp
var client = new HttpClient();
var response = await client.GetAsync("https://api.stripe.com/v1/customers");
```
