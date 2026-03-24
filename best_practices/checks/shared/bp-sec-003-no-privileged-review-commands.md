# BP-SEC-003: No privileged commands in review context

## Intent

Automated review should not require elevated privileges or host-mutating
operations. Privileged review paths create unnecessary blast radius and raise
the cost of trusting the automation.

## Applicability

Applies to agent instructions, repository scripts used during review, CI review
steps, and container/runtime settings for the review environment.

Return `unknown` when the review runtime is not visible.

## Strategy

`static`

## What to inspect

1. Review agent instructions, CI scripts, helper scripts, and runtime config
   used by the review process.
2. Look for `sudo`, privileged containers, host mounts with elevated rights,
   root-required workflows, or destructive commands in the default review path.

## Pass criteria

- Review can run rootless and without privileged host access.
- Tooling restricts itself to read-oriented, least-privilege operations.

## Fail criteria

- Review scripts or agent guidance require `sudo`.
- Containers run `--privileged` or equivalent for ordinary review.
- The review path performs host mutations that are not explicitly required and
  isolated.

## Do not flag

- Dedicated deployment or admin workflows outside review.
- Explicitly opt-in maintenance scripts not part of automated review.

## Evidence to collect

- The privileged command or runtime configuration.
- The fact that it is part of the review path.

## Confidence guidance

- `HIGH`: privileged review behavior is directly visible.
- `MEDIUM`: root requirement is strongly implied by scripts or runtime setup.
- `LOW`: prefer `unknown` if the execution path is ambiguous.

## Remediation

- Remove privileged commands from the review path.
- Run the review in a rootless, least-privilege environment.
- Restrict allowlists to the minimum needed capabilities.
