# BP-OPS-005: Deployment config is environment-agnostic

## Intent

Deployment artifacts should describe how to run the software, not hard-code
environment-specific values that create drift between staging, prod, and local
setups.

## Applicability

Applies to manifests, compose files, Helm charts, Terraform variables,
deployment scripts, and other committed runtime configuration.

Return `unknown` when deployment config is not in scope.

## Strategy

`static`

## What to inspect

1. Review changed deployment and infrastructure config.
2. Look for hard-coded environment names, hosts, credentials, account IDs,
   cluster-specific values, or region-specific resource names where templates or
   variables should be used.

## Pass criteria

- Deployment config is parameterized or environment-bound through explicit
  configuration injection.
- Environment-specific values live in secret stores, deployment variables, or
  separate environment overlays.

## Fail criteria

- A shared deploy artifact hard-codes environment-specific endpoints,
  credentials, or cluster values.
- Production assumptions are baked into the default manifest.

## Do not flag

- Placeholder names and variable references.
- Explicit per-environment overlays that are intentionally separate.
- Clearly local-only development manifests.

## Evidence to collect

- The hard-coded environment-specific value.
- The shared deployment artifact where it appears.

## Confidence guidance

- `HIGH`: environment-specific values are directly committed in shared deploy
  config.
- `MEDIUM`: the value looks environment-specific but its ownership is partly
  inferred.
- `LOW`: prefer `unknown` if the file may be local-only.

## Remediation

- Move environment-specific values to configuration injection or overlays.
- Keep shared artifacts portable across environments.
