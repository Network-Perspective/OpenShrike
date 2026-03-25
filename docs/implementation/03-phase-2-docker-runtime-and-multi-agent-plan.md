# OpenShrike Phase 2 Implementation Plan: Docker Runtime and Multi-Agent Review

Date: 2026-03-25

## Purpose
This document plans the Phase 2 features listed in `docs/requirements/02-feature-scope.md`:
- Isolated Docker runtime
- Multi-agent review with parallel reviewers

Implementation status:
- `--runtime native|docker` is implemented.
- Docker runs use `shrike internal scan-worker` inside an ephemeral container.
- Parallel check workers are implemented via `--parallelism <N|auto>`.
- The CLI/runtime path can stream worker progress and OpenCode events back from
  Docker workers.

## Current baseline
The current CLI is a TypeScript application with `shrike scan` as the main entry point.

Current behavior:
- Resolves a repo and scan scope on the host machine.
- Expands a policy into individual checks.
- Creates one OpenCode runtime per scan.
- Evaluates checks sequentially.
- Produces one aggregated report.
- Supports local execution and CI invocation, but without a container boundary or parallel scheduling.

Implications for Phase 2:
- Docker should be added as an execution backend, not as a separate user workflow.
- Parallel review should sit above the existing evaluator/report model so current check definitions remain valid.
- The default local path should stay low-friction; hardened execution should be opt-in locally and defaultable in CI.

## Design principles
- Preserve `shrike scan` as the main user-facing command.
- Keep native execution available for zero-setup local use.
- Make Docker execution and CI execution use the same runtime image and mostly the same flags.
- Prefer additive CLI changes over replacing the current command surface.
- Parallelism must remain deterministic in reporting order even when execution is concurrent.
- Avoid introducing a long-running daemon as the first implementation step.

## Recommended Phase 2 direction
Implement Phase 2 in two layers:

1. Docker runtime as an optional backend for `shrike scan`, with one ephemeral container per scan.
2. Parallel review as a scheduler that runs check shards concurrently inside that backend.

This path gives the best balance of:
- minimal disruption to the current architecture,
- strong parity between local and CI runs,
- clear security boundaries,
- straightforward observability and debugging,
- a realistic developer experience on laptops.

## Docker runtime options
(options excluded from implementations have been removed)

### Option A: Host-launched ephemeral scan container
Recommended first implementation.

Model:
- The host CLI stays the entry point.
- `shrike scan` prepares a scan request and launches a single ephemeral container.
- The container runs the same OpenShrike CLI in a worker mode.
- The repo is mounted read-only.
- Artifacts and logs are written to a dedicated writable output mount.
- OpenCode runs inside the container.

Why this fits the current codebase:
- It maps well to the existing `runScan` flow.
- It can reuse the current evaluator and report builder.
- It avoids a separate control plane or resident service.
- It makes local reproduction of CI behavior simple.

Developer experience:
- One command for native and Docker modes.
- Easy to reason about failures because the container is tied to a single scan.
- Easy cleanup because no persistent runtime is left behind.

Tradeoffs:
- Container startup overhead on every scan.
- Requires Docker or Podman on developer machines when enabled.
- LLM credentials still need careful forwarding into the container.

Proposed future CLI examples:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --runtime docker \
```

```bash
shrike scan \
  --check csharp-rel-001-cancellation-tokens \
  --repo ../OpenShrike.TestsCsharp \
  --scan-scope full \
  --runtime docker \
  --image ghcr.io/openshrike/runtime:2026.03
```

## Recommended Docker integration details

### Runtime architecture
Recommended structure:
- Public command: `shrike scan`
- Internal command for the container entrypoint: `shrike internal scan-worker`
- New runtime abstraction: `native` and `docker`

Flow:
1. Host CLI validates args and resolves absolute paths.
2. Host CLI writes a small request file into a temporary I/O directory.
3. Host CLI launches `docker run` with:
   - repo mounted read-only,
   - output directory mounted read-write,
   - temp request mounted read-only,
   - explicit env allowlist,
   - resource limits,
   - rootless user when supported.
4. Container runs `shrike internal scan-worker --request /io/request.json`.
5. Worker executes the existing scan pipeline and writes:
   - `report.json`
   - `scan.log.jsonl`
   - optional per-worker partial reports later for parallel mode
6. Host CLI streams progress and returns the final report.

### Security model alignment
Docker mode should align with `docs/requirements/03-security-model.md` and `docs/requirements/04-agent-runtime.md`.

Baseline hardening:
- Use a pinned runtime image with Node, OpenShrike, OpenCode CLI, `git`, and `rg`.
- Run as non-root.
- Mount repo read-only.
- Use a scratch writable directory for temp files and outputs.
- Do not mount host home directories.
- Do not mount Docker socket.
- Drop unnecessary Linux capabilities.
- Keep the agent permission policy deny-by-default inside OpenCode.

Critical credential note:
- The model provider credential still has to reach the runtime somehow.
- That credential must be forwarded only to the runner process, not written into the repo or emitted into logs.
- If OpenCode or its tool subprocess model makes credential hiding incomplete, Docker-hardened mode should be documented as reducing host exposure rather than fully eliminating provider-secret exposure to the runtime process.

### Image strategy
Recommended image approach:
- One official runtime image for both local Docker mode and CI.
- Version tags tied to OpenShrike releases.
- Include SBOM generation and provenance checks in the image build.
- Keep package installation out of runtime execution.

Suggested images:
- `ghcr.io/openshrike/runtime:<version>` for standard use
- `ghcr.io/openshrike/runtime:<version>-debug` later if interactive troubleshooting is needed

### Local developer experience
Recommended default behavior:
- `--runtime native` remains the default for low-friction local use. (default)
- `--runtime docker` is the parity mode for reproducing CI behavior.

Good DX defaults:
- Reuse the current `.openshrike` config model.
- Auto-create a local artifact directory when Docker mode is used.
- Print the exact `docker run` command in debug logs.
- Add a preflight error when Docker is requested but unavailable.
- Keep output paths stable so users can diff reports across native and Docker runs.

CLI / UI
- Stream opencode events from Docker workers when OpenCode is active.
- Stream per-worker progress from Docker workers in all runtime modes.

Proposed future CLI examples:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --runtime native
```

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --runtime docker \
  --artifacts-dir .openshrike/artifacts/latest
```

### CI/CD execution options

#### CI option 1: Generic runner plus `docker run`
Recommended baseline for broad compatibility.

Flow:
- CI checks out the PR branch.
- CI invokes `shrike scan --runtime docker`.
- The host job launches the official runtime image.
- The final report is uploaded as an artifact and optionally summarized back to the PR.

Benefits:
- Strong parity with local Docker mode.
- Works on runners that allow Docker.
- No custom remote service required.

Example:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --scan-scope pr \
  --scan-target origin/main...HEAD \
  --runtime docker \
  --artifacts-dir artifacts/shrike
```

## Multi-agent review options

### Option 1: Parallel by check shard
Recommended first implementation.

Model:
- Expand the policy to check IDs.
- Partition checks into shards.
- Run multiple workers in parallel.
- Each worker evaluates one check or a small check subset.
- Aggregate partial reports into the existing final report shape.

Why this should come first:
- It matches the current per-check evaluator.
- It minimizes changes to check definitions.
- It directly improves throughput.
- It is easier to make deterministic.

Developer experience:
- One new flag for concurrency.
- One final report.
- No new authoring model for best-practice checks.

Proposed future CLI examples:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --parallelism 4
```

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --runtime docker \
  --parallelism auto
```


## Recommended parallel execution model

### Scheduler design
Recommended scheduler behavior:
- Default review strategy in Phase 2: `check-shards`
- Default execution mode:
  - local native: sequential unless `--parallelism` is set
  - local Docker: parallel allowed but conservative by default
  - CI Docker: parallel enabled by default when policy expands to multiple checks
- Stable ordering in the final report by original check order
- Failures in one worker should not discard completed worker results
- Worker-level retries only for transport/runtime failures, not for real check failures

### Concurrency control
Recommended behavior:
- Support `--parallelism <N>`
- Add jittered backoff for 429 or transient provider errors
- Emit a warning when requested parallelism is above a safe configured ceiling

### Aggregation model
Phase 2 should preserve the current report contract and add metadata rather than replacing it.

Recommended additions:
- optional top-level `execution` block
- per-check metadata for:
  - `worker_id`
  - `attempt`
  - `duration_ms`
  - `runtime_mode`

This keeps downstream compatibility while improving observability.

### Parallelism placement options

#### Placement A: One container, many workers
Recommended first implementation for Docker mode.

Model:
- Start one scan container.
- Run multiple worker tasks inside it.
- Share one prepared filesystem view.

Benefits:
- One container startup cost.
- Easier aggregation.
- Best local developer experience.

Costs:
- Weaker isolation between parallel workers than per-container workers.
- Needs careful local resource scheduling.


## Recommendation on "parallel reviewers"
Use the term "parallel reviewers" in user-facing docs, but implement it first as parallel check shards.

Rationale:
- Users care about faster review completion.
- The current architecture is check-centric.
- Check sharding gives immediate speed gains without redefining policy authoring.
- Reviewer-role fanout can be layered later once the scheduler and aggregation primitives exist.

## Proposed CLI surface

Example local parity run:

```bash
shrike scan \
  --policy csharp-baseline \
  --repo . \
  --runtime docker \
  --parallelism 2
```

## Implementation roadmap

### Milestone 1: Runtime abstraction
Scope:
- Introduce a runtime mode abstraction at the CLI and library level.
- Keep current behavior as the `native` implementation.
- Add request/response file contracts for a worker invocation.

Likely code areas:
- `src/cli.ts`
- `src/commands/scan.ts`
- `src/lib/types.ts`
- `src/lib/scan-options.ts`
- new runtime-driver module

Exit criteria:
- Existing native scans still work unchanged.
- Scan options validate runtime mode cleanly.

### Milestone 2: Docker scan worker
Scope:
- Add `docker` runtime mode.
- Build the official runtime image.
- Add an internal worker entrypoint.
- Write logs and report artifacts to mounted storage.

Exit criteria:
- Native and Docker runs produce equivalent reports on the same fixture repo.
- CI can run the Docker mode without local-only assumptions.

### Milestone 3: In-process parallel check scheduler
Scope:
- Add `check-shards` strategy.
- Support `--parallelism`.
- Run multiple workers concurrently and aggregate results.

Exit criteria:
- Report shape remains backward compatible.
- Output ordering stays deterministic.
- Partial worker failure is surfaced without losing successful shard results.

## Developer experience recommendations
- Keep native mode as the default for first-time local users.
- Make Docker mode explicit so developers know when they are paying startup cost for parity/security.
- Document two common paths clearly:
  - "fast local loop" with native mode
  - "match CI exactly" with Docker mode
- Keep one final report format regardless of runtime mode.
- Make log and artifact locations obvious and stable.
- Expose enough metadata for debugging without forcing users to inspect container internals.

## Testing strategy

### Unit tests
- Runtime option parsing and validation
- Docker command construction
- Env allowlist filtering
- Shard planner stability
- Report aggregation ordering

### Integration tests
- Native vs Docker parity on the same fixture repo
- Parallel vs sequential parity for the same policy
- Read-only repo enforcement in Docker mode
- Worker failure and retry handling
- CI-style shard merge equivalence

### Fixture coverage
- Small policy with 2-3 checks for deterministic parallel tests
- At least one failing and one passing shard
- One rate-limit or transient runtime failure simulation

## Risks and open questions
- Provider credential handling inside hardened containers needs careful threat modeling.
- Parallel model calls may shift bottlenecks from CPU time to rate limits and token cost.
- One-container-many-workers is best for DX, but one-container-per-worker may be required for stricter isolation later.
- If CI uses a job container as the boundary, documentation must explain why `--runtime native` is still acceptable there.

## Final recommendation
Phase 2 should start with:
- Option A for Docker: one ephemeral scan container launched by `shrike scan`
- Option 1 for multi-agent review: parallel check shards with deterministic aggregation
