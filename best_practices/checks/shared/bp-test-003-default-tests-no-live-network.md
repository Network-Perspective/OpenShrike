# BP-TEST-003: Default automated tests do not require live network dependencies

## Intent

Routine PR validation should be fast, hermetic, and reproducible. Live network
dependencies create flaky failures, hidden credentials requirements, and
environment-sensitive behavior.

## Applicability

Applies to unit, integration, and contract tests expected to run in the default
developer and CI path.

Return `unknown` when the test-suite taxonomy is not visible.

## Strategy

`heuristic`

## What to inspect

1. Review tests for real URLs, cloud resources, or ambient credential use.
2. Check whether the tests instead use local emulators, test servers, mocks, or
   ephemeral containers.

## Pass criteria

- Default tests use hermetic dependencies.
- True end-to-end tests are clearly marked, separated, or opt-in.

## Fail criteria

- Ordinary tests call real external services.
- Tests rely on developer secrets or ambient production-like credentials.

## Do not flag

- Local loopback services, local containers, or in-process test servers.
- Explicitly isolated end-to-end environments outside normal PR gating.

## Evidence to collect

- The live network call or ambient credential usage.
- The fact that it sits in the default test path.

## Confidence guidance

- `HIGH`: a default test directly calls a real remote service.
- `MEDIUM`: network dependency is visible, but isolation status is inferred.
- `LOW`: prefer `unknown` if endpoint ownership is unclear.

## Remediation

- Replace live dependencies with local emulators, mocks, or containers.
- Move true end-to-end coverage behind an explicit gate.
