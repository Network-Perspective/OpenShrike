# CLEAN-ARCH-003: Boundary ports are owned by the inner policy layer

## Intent

Repositories, gateways, output ports, and similar boundary contracts should be
defined by the inner layer that needs them. This keeps adapters replaceable and
prevents infrastructure concerns from dictating the shape of core policy code.

## Applicability

Applies when the diff adds or materially changes interfaces, abstract classes,
protocols, or callback contracts that cross a Clean Architecture boundary.

Return `unknown` when:

- no boundary contract is visible in the diff,
- the repository does not show an inner/outer split, or
- the changed abstraction is a generic utility rather than a policy/detail seam.

## Strategy

`heuristic`

## What to inspect

1. Identify the changed boundary contract and the concrete implementation(s).
2. Determine which side of the boundary conceptually needs the contract.
3. Check whether the contract is declared inward and implemented outward, or
   declared outward and consumed inward.

## Pass criteria

- The inner policy layer declares the port in terms meaningful to that policy.
- Outer adapters implement the port and depend inward on the policy layer.

## Fail criteria

- Infrastructure, framework, transport, or database layers declare the contract
  that core policy must depend on.
- Core policy imports adapter-owned interfaces because the port lives in an
  outer package or module.

## Do not flag

- Truly shared low-level abstractions that are not acting as policy/detail
  boundaries.
- Public framework APIs used only inside outer adapters.
- Existing contract ownership that is out of scope and unchanged.

## Evidence to collect

- The location of the port or abstract contract.
- The location of the implementation.
- The dependency direction that results from that ownership choice.

## Confidence guidance

- `HIGH`: the contract is visibly declared in infrastructure and imported by
  core policy.
- `MEDIUM`: the ownership is inferred from names and layout, but the boundary
  role is still clear.
- `LOW`: prefer `unknown` when the abstraction is not clearly a Clean
  Architecture port.

## Remediation

- Move the port or interface into the inner layer that needs the behavior.
- Let outer adapters implement that port.
- Rename the contract in policy terms rather than framework or storage terms.
