# Docker Runtime OpenCode State and Credential Handoff

Date: 2026-05-12

Status: Accepted

## Decision

- Native and Docker scans share the same repo-local OpenCode overlay contract:
  `.openshrike/opencode.json`.
- The host CLI resolves that config and injects the resulting OpenCode config
  into the Docker worker.
- Docker env pass-through is derived only from env vars explicitly declared by
  that config:
  - `provider.<name>.env`
  - `${VAR}` placeholders
  - `{env:VAR}` placeholders
- Docker must not mount the host home directory wholesale.
- When host OpenCode state is needed, Docker mounts only:
  - `~/.config/opencode` read-only
  - `~/.local/share/opencode` read-write
- Those host paths are remapped into a synthetic runtime home under the worker
  I/O mount instead of their original host-home paths.
- Writable XDG state and cache directories are created under that synthetic
  runtime home inside the writable artifacts mount.

## Context

- Native mode inherits the user shell environment and host filesystem state.
- Docker mode should not rely on ambient host env or a writable host home.
- OpenCode needs both configuration/auth state and writable XDG state/cache
  paths in order to start reliably.
- Broad env forwarding weakens the Docker security boundary because unrelated
  host credentials can leak into the worker.
- Mounting the host home directly caused startup failures when OpenCode tried to
  create state directories such as `~/.local/state` from inside the container.
- Docker/native parity should depend on one explicit contract: the repo-local
  OpenCode config declares every env var the runtime is allowed to see.

## Alternatives Considered

- Forward env vars by provider prefix.
  Rejected because it exposes unrelated host credentials and makes the Docker
  boundary depend on naming conventions instead of explicit config.
- Mount the host home directory directly.
  Rejected because it is too broad, makes permission behavior fragile, and
  expands the container-visible filesystem unnecessarily.
- Require provider credentials to live directly in the repository.
  Rejected because it would move secrets into project-controlled files and break
  the split between repo-local defaults and user-global OpenCode setup.
- Copy OpenCode auth/config into an isolated temp directory for every run.
  Deferred because the current OpenCode setup expects stable config/data
  directories and the narrower mount approach achieves parity with lower risk.

## Consequences

- Docker only sees env vars declared by `.openshrike/opencode.json`.
- Native runs may appear to work if the host shell exposes undeclared env vars,
  but Docker will intentionally not inherit them.
- Missing or misnamed env vars now fail fast once the config references them
  explicitly, which improves parity diagnostics.
- Docker hardening reduces ambient host exposure, but it does not eliminate
  exposure to the specific provider credentials intentionally passed to the
  OpenCode runtime process.
- The writable exception is limited to OpenCode runtime state, not the repo
  mount, which remains read-only.
- User and init documentation should keep steering configuration toward
  explicit env declarations in `.openshrike/opencode.json`.
