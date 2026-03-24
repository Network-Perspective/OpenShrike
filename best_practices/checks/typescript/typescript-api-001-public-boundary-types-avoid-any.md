# TYPESCRIPT-API-001: Public boundary types avoid `any`

## Intent

`any` at public boundaries erases the contract that TypeScript is supposed to
make explicit. Reviewable SDKs, libraries, and service boundaries should expose
concrete or intentionally generic shapes, not type escape hatches.

## Applicability

Applies to exported library APIs, SDKs, reusable shared packages, and internal
cross-team contracts.

Return `unknown` when the code is purely internal and not consumed outside the
module.

## Strategy

`heuristic`

## What to inspect

1. Review exported functions, classes, interfaces, and DTO types changed in the
   diff.
2. Look for `any` in parameters, return types, callback signatures, and public
   properties.

## Pass criteria

- Public boundaries use specific types, `unknown`, or deliberate generics.

## Fail criteria

- New or changed public APIs expose `any` where a meaningful contract should
  exist.

## Do not flag

- Deep framework internals not exposed as a contract.
- Temporary migration shims clearly isolated from long-term public API.

## Evidence to collect

- The exported boundary type.
- The `any` escaping through it.

## Confidence guidance

- `HIGH`: exported contract types visibly include `any`.
- `MEDIUM`: external-consumer status is inferred from package structure.
- `LOW`: prefer `unknown` if the code is likely internal-only.

## Remediation

- Replace `any` with explicit types, `unknown`, or constrained generics.
- Keep unsafe coercion inside implementation code, not at the boundary.
