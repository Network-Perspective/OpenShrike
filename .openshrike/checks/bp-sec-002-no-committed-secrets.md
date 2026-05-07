# BP-SEC-002: Secrets are not committed to source control

## Intent

Committed secrets leak into forks, caches, logs, and developer machines and are
difficult to fully revoke once exposed.

## Applicability

Applies to committed configuration, manifests, scripts, fixtures, and
documentation examples.

Return `unknown` when a value looks secret-like but may be an inert sample.

## Strategy

`static`

## What to inspect

1. Review changed config and script files for plaintext credentials, API keys,
   tokens, private keys, and credential-bearing connection strings.

## Pass criteria

- Config contains placeholders, references, secret names, or obviously inert
  sample values.

## Fail criteria

- The diff commits plaintext credentials, private keys, or live secret material.

## Do not flag

- Redacted values.
- Secret identifiers or placeholder templates.
- Clearly inert examples in documentation.

## Evidence to collect

- The committed secret-bearing value.

## Confidence guidance

- `HIGH`: the value is clearly a live secret or private key.
- `MEDIUM`: the value strongly resembles a secret but may be a sample.
- `LOW`: prefer `unknown` if the value cannot be distinguished from example
  data.

## Remediation

- Remove the secret from source control.
- Rotate exposed credentials.
- Replace with secret references or environment bindings.
