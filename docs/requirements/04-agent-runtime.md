# Agent Runtime and Isolation

## Goals
- Provide a controlled CLI for agents to run tests, search code, and inspect
  artifacts without accessing secrets or external networks.
- Guarantee reproducibility and traceability for every agent action.
- Use opencode as the agent runtime instead of reimplementing one.

## Runtime choice: opencode
- Opencode is the chosen agent runtime for MVP. This is an accepted coupling
  for speed — it provides LLM orchestration, tool use, sandboxing, and a skill
  format out of the box.
- The policy assembler outputs opencode skills as its target format.
- If opencode's skill format changes, the assembler must be updated accordingly.
- A runtime abstraction layer is not planned for MVP but may be considered if
  a second runtime is needed in the future.

## Runtime model
- Runtime mode is explicit: `native` for direct local execution and `docker`
  for isolated worker execution.
- Docker mode runs the scan inside an ephemeral container with a clean
  filesystem view and a read-only repo mount.
- Native mode remains the local default for fast iteration and lower setup cost.
- Native mode must support both:
  - read-only scan and recheck sessions
  - exclusive edit-capable fix sessions triggered explicitly by the operator
- Commands are executed through a broker that enforces allowlists and quotas.
- All command input/output is logged and hashed for audit trails.
- The runtime executes an assembled bundle of checks to avoid repeated setup.
- CLI progress should continue streaming even when execution happens inside
  Docker or across multiple parallel workers.

## Decision records
- Docker/OpenCode state and credential handoff:
  `docs/implementation/06-docker-runtime-opencode-handoff.md`

## Bundled execution model
- Policy assembler emits an opencode skill with step-by-step instructions.
- Bundle performs shared setup once (checkout, deps, index build).
- Bundle emits a structured report containing per-check status and confidence.

## Isolation backend (initial decision)
- Supported backends in Phase 2:
  - native host execution
  - Docker isolated execution
- Rationale: native keeps the local loop fast, while Docker provides a clear
  isolation boundary and CI parity.

## Container hardening (baseline)
- Rootless containers where possible.
- Read-only mounts for repo; writable space is limited to artifacts and the
  minimal OpenCode runtime-state exception documented in
  `docs/implementation/06-docker-runtime-opencode-handoff.md`.
- No privileged containers and minimal Linux capabilities.
- Network disabled by default; allowlist only when explicitly required.
- No host socket mounts (e.g., Docker socket) in agent containers.
- No wholesale host-home mounts; only narrowly scoped OpenCode state mounts when
  required for runtime parity.

## Known risks and mitigations
- Kernel escape risk: containers share the host kernel. Mitigate with rootless
  runtime, tight capability set, and optional stronger backends.
- Runtime vulnerabilities: runc/containerd/crun CVEs. Mitigate with pinned,
  patched runtimes and SBOM-based provenance checks.
- Misconfigured mounts: avoid bind-mounting sensitive host paths.

## Broker responsibilities
- Command allowlist and argument validation.
- Resource limits (CPU, memory, wall-clock).
- File access policies:
  - read-only repo access for scan and recheck sessions
  - controlled repository writes only for explicit fix sessions in native mode
  - Docker review runs remain read-only in the first implementation
- Structured logging and event emission.
- Collect shared evidence for reuse across multiple checks.

## Example agent capabilities (non-functional)
- Run tests to validate assumptions: `shrike tool test`
- Search for usage patterns: `shrike tool rg "unsafe" src/`
- Inspect dependency graphs: `shrike tool deps`

## Open questions
- When should we offer gVisor or Firecracker as an opt-in backend?
- Should the runtime be pluggable for different org security needs?
