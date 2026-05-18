# Terminal E2E Test Suite Plan

Date: 2026-05-18

Status: phases 1-4 implemented, phase 5 proposed

## Goals

- Add a real end-to-end test lane that drives `shrike` through a PTY.
- Keep AI behavior deterministic by running a local mock provider endpoint.
- Assert both visible terminal behavior and outbound prompt payloads.
- Reuse the existing Vitest test runner and current non-E2E tests.
- Start with native runtime; stage Docker and cross-platform later.

## Non-goals for the first implementation

- Replacing existing unit and integration tests.
- Full Docker E2E parity in the first pass.
- Depending on live external providers or user-global OpenCode state.

## Current codebase constraints

- The repo already uses Vitest and `tests/**/*.test.ts`.
- `shrike init` requires an interactive terminal and renders through Ink on
  stderr.
- `shrike scan` and `shrike fix` can render a live Ink dashboard or run
  headless.
- Native OpenCode runtime is started by spawning `opencode serve` and
  injecting config via `OPENCODE_CONFIG_CONTENT`.
- The existing `--mock-opencode` path bypasses the real OpenCode and provider
  transport, so it cannot verify terminal integration or prompt bodies.

## Library evaluation

### Option A: `@microsoft/tui-test`

Pros:

- Purpose-built terminal E2E framework.
- Auto-wait, tracing, snapshots, shell abstraction, and isolated terminal
  contexts are already built in.
- Good fit if the repo wants a dedicated second runner focused only on
  terminal UX.

Cons:

- Separate test runner and conventions from Vitest.
- Smaller ecosystem and less direct reuse of current helpers and assertions.
- Harder to share fixtures, setup, and utilities with the existing Vitest
  suite.
- Feels best when adopted as the primary terminal test runner, which this
  repo is not set up for.

Assessment:

- Usable, but not the best fit for a codebase already standardized on Vitest.

### Option B: `node-pty` + `@xterm/headless` + Vitest

Pros:

- Real PTY interaction while keeping one runner, one reporter, and one
  mocking model.
- Fine-grained control over terminal size, env, timing, transcripts, and
  failure artifacts.
- Easy to integrate with current temp-repo helpers and future custom
  assertions.
- Lets us assert both raw transcripts and normalized terminal screen state.

Cons:

- More harness code to write.
- `node-pty` is a native dependency.
- `@xterm/headless` is explicitly experimental, so the wrapper around it
  should stay small.
- We must implement our own wait helpers, key helpers, and snapshot helpers.

Assessment:

- Best overall fit. It matches the repo's existing Vitest investment and
  gives us the control we need for prompt assertions.

### Option C: `ink-testing-library`

Pros:

- Good for component-level Ink tests.
- Faster and more deterministic for rendering-focused assertions.
- Could simplify a few existing UI-focused tests.

Cons:

- Not process-level E2E.
- Does not validate Commander bootstrapping, PTY behavior, raw mode, stderr
  rendering, child process management, or OpenCode integration.
- Not enough for the "verify prompts sent to the agent" requirement.

Assessment:

- Useful as an optional complement, not as the main E2E approach.

### Vitest vs Jest

Recommendation:

- Stay on Vitest.

Why:

- The repo already ships Vitest config and a large Vitest suite.
- Vitest can isolate E2E with a separate test project or config without
  introducing a second runner.
- Moving E2E to Jest would add duplicate config, duplicate setup, and no
  clear benefit for PTY testing.

Jest would still be reasonable if the repo were already on Jest or if a
chosen terminal framework required it, but neither is true here.

## Recommended stack

- Test runner: Vitest with a dedicated `vitest.e2e.config.ts`
- Terminal driver: `node-pty` API via `@lydell/node-pty` in Phase 1
- Terminal state normalization: `@xterm/headless`
- Mock AI: custom local HTTP server implemented in the test suite
- Config strategy: repo-local OpenCode config with provider `baseURL`
  pointed at the mock server
- Initial scope: native runtime only

Phase 1 note:

- The upstream `node-pty` package currently requires native build tooling in
  this environment and failed without Python for `node-gyp`.
- To keep the E2E lane runnable in bare CI and local dev shells, Phase 1 uses
  `@lydell/node-pty`, which preserves the PTY API while shipping platform
  prebuilds as optional dependencies.
- Once CI has a guaranteed native toolchain or upstream prebuild coverage is
  good enough, we can switch the import back to upstream `node-pty` without
  changing the harness shape.

## Provider protocol choice

Phase 1 should target the OpenAI Responses API, not Chat Completions.

Local probe results against OpenCode 1.3.0:

- the provider request is `POST /v1/responses`,
- the request body includes `stream: true`,
- the prompt content is carried in the final `input` entry as `input_text`,
- a successful mock response can be implemented as SSE frames containing:
  - `response.created`
  - `response.output_item.added`
  - `response.content_part.added`
  - `response.output_text.delta`
  - `response.output_text.done`
  - `response.content_part.done`
  - `response.output_item.done`
  - `response.completed`

This means the mock server does not need to imitate the entire OpenAI API
surface. It only needs one deterministic `responses` stream path for Phase 1.

## Why the mock AI should be a real local server

Do not use in-process HTTP interception libraries as the main strategy.

Reason:

- OpenShrike spawns `opencode serve` as a separate process.
- Any mock that only patches the current test process will not reliably
  intercept child-process network traffic.
- A real local HTTP server gives us deterministic behavior, exact request
  capture, and parity with how OpenCode actually talks to providers.

The mock server should:

- listen on a random local port,
- record method, path, headers, and parsed JSON body for each request,
- return scripted responses in a deterministic queue,
- expose helper assertions such as `expectOneRequest()`,
  `expectPromptContains()`, and `expectModel()`.

## OpenCode provider strategy

Use the built-in `openai` provider with a custom `baseURL` pointing to the
mock server.

Why this is the safest first choice:

- OpenCode officially supports overriding provider `baseURL`.
- It avoids depending on live provider credentials.
- It is simpler than a custom provider definition.
- Recent OpenCode issues show recurring problems with custom
  `@ai-sdk/openai-compatible` providers not forwarding options or hanging, so
  we should not make that the first path our E2E suite depends on.

Guardrails:

- Give each test its own isolated `HOME` and `XDG_*` directories.
- Do not rely on the user's real `~/.config/opencode` or `auth.json`.
- Pass a dummy API key through env declarations in the test config.
- Keep the provider and model IDs fixed and synthetic.

## Test harness design

Add a dedicated E2E layer under `tests/e2e/` with small, reusable helpers.

Phase 1 helpers:

- `tests/e2e/support/terminal-session.ts`
  - wraps the PTY driver
  - exposes `type()`, `press()`, `resize()`, `waitForText()`,
    `waitForIdleFrame()`, visible-screen capture from the xterm buffer, and
    `close()`
- `tests/e2e/support/mock-ai-server.ts`
  - starts and stops the local mock provider
  - scripts deterministic Responses API SSE payloads
  - captures request payloads for assertions
- `tests/e2e/support/test-env.ts`
  - creates isolated temp repo, temp home, temp XDG dirs, and temp artifacts
    dir
  - writes repo-local `.openshrike/project.json` and `.openshrike/opencode.json`
  - writes deterministic env vars

Phase 1 will keep the helper surface small and fold fixture creation into
`test-env.ts`. Split out `fixtures.ts` later only if multiple E2E files start
sharing more complex scenarios.

## Terminal normalization rules

To reduce flakes, every terminal E2E test should run with fixed terminal
settings:

- fixed columns and rows,
- `TERM=xterm-256color`,
- isolated working directory and home directory,
- stable locale,
- colors disabled unless the assertion needs them,
- explicit timeouts and wait helpers instead of arbitrary sleeps.

The harness should keep two outputs:

- raw PTY transcript for debugging,
- normalized visible terminal snapshot from the headless xterm buffer.

## What to test first

### Phase 1: scan happy path

Add one native-runtime E2E that:

- creates a temp repo with one project-local check,
- points OpenCode to the mock AI endpoint,
- runs `shrike scan` in a real PTY,
- waits for the live UI to reach `Scan complete`,
- sends `Esc` to close the completed UI,
- asserts the final Markdown report printed after the UI exits,
- asserts the mock server saw exactly one prompt,
- asserts the prompt included the expected check markdown and scope evidence.

This is the minimum test that proves the full path:

`shrike` CLI -> Ink TUI -> OpenCode server -> provider HTTP call -> response
-> final report

### Phase 2: scan failure and structured output

Add non-TUI and TUI variants that:

- return a failing mock response,
- verify exit code behavior,
- verify JSON or Markdown output,
- verify the prompt content still matches expectations.

### Phase 3: fix loop

Add a `shrike fix` E2E that:

- starts from a failing report,
- scripts one fix response and one recheck response,
- verifies repository files changed as expected,
- verifies the final report becomes passing,
- asserts both outbound prompts were captured.

### Phase 4: init TTY flow

Add an interactive `shrike init` PTY test that:

- drives arrow keys and enter through the wizard,
- uses isolated fake OpenCode discovery inputs,
- verifies written `.openshrike/` files and final screen text.

This phase does not need the mock AI endpoint for prompt verification because
`init` is about discovery and file generation, not provider inference.

### Phase 5: regression and edge cases

This phase should harden the native PTY lane that now exists, not widen the
command surface further. Reuse the current `tests/e2e/support/*` helpers and
add only the smallest missing fixture and artifact utilities needed for
failure-path coverage.

Ship Phase 5 in six slices:

#### 5.1 Interrupted scan

Add a PTY cancellation test that:

- queues a delayed mock provider response so the scan stays visibly in
  progress,
- waits for the dashboard to show a running state,
- sends `Esc`, confirms exit with `y` or `Enter` on `Yes`,
- asserts the process exits with code `130`,
- asserts no final Markdown report is printed after cancellation,
- asserts the mock server saw no more than the already-started request,
- asserts the PTY closes without hanging.

This verifies the user-abort path separately from the normal "scan complete,
dismiss UI, print report" flow already covered in Phase 1.

#### 5.2 Missing provider env var

Add startup-failure E2Es that:

- remove the required provider env var from the fixture,
- run `shrike scan --no-ui --output json` for machine-readable assertions,
- keep one markdown-rendered variant for the default CLI error path if the
  extra runtime cost stays acceptable,
- assert exit code `1`,
- assert the rendered error reports `MISSING_ENVIRONMENT`,
- assert the output includes config path, selected model, and missing env var
  name,
- assert the mock provider receives zero requests.

This should prove the terminal lane preserves the actionable setup guidance
already covered in unit tests, instead of silently downgrading startup failures
into inconclusive check results.

#### 5.3 No changes in scope

Add explicit terminal coverage for both no-change branches:

- clean `uncommitted` scope should fail fast with `NO_CHANGES_IN_SCOPE`,
- empty non-full scopes such as `branch` should return an all-`unknown` report
  instead of failing hard,
- both variants should assert zero provider requests and no lingering UI state.

The `uncommitted` case matters most because it is the default local flow. Add
the non-fatal empty-scope variant immediately after that so both user-visible
branches are covered end to end.

#### 5.4 Multiple checks with parallelism greater than 1

Add a multi-check fixture that:

- creates at least three project-local checks,
- runs `shrike scan --parallelism 2` or `3`,
- scripts mock responses with staggered delays so completion order differs from
  check enumeration order,
- asserts the final summary counts and per-check statuses are correct,
- asserts every captured request maps back to the expected check id and prompt
  body,
- adds one log-enabled variant that verifies worker-oriented JSONL entries are
  present when `--log` is used.

Start with a headless assertion path for determinism, then add one TUI smoke
variant if the first parallel test stays stable.

#### 5.5 Prompt content regression snapshots

Add prompt regression coverage for a small set of canonical flows:

- single-check `scan`,
- multi-check `scan` with parallelism greater than 1,
- optionally `fix` once the scan prompt shape is stable.

Snapshot rules:

- snapshot normalized prompt text, not the full HTTP request body,
- scrub temp paths, absolute repo roots, ports, and other fixture-specific
  values,
- keep targeted semantic assertions next to the snapshot so failures stay
  understandable,
- prefer checked-in `.md` or `.txt` golden files over large inline snapshots.

The current string-fragment assertions should remain, but snapshots should
catch broader prompt drift that is easy to miss when only a few substrings are
checked.

#### 5.6 Artifact and log capture on failure

Extend the harness so a failing E2E can preserve:

- raw PTY transcript,
- normalized visible screen text,
- captured mock AI requests,
- JSONL runtime log when `--log` is enabled,
- `.openshrike/artifacts` contents when present,
- temp repo and temp home paths.

Recommended behavior:

- write artifacts under a stable temp directory per test,
- print the artifact directory in the failing assertion message,
- keep successful runs self-cleaning by default,
- allow an opt-in env flag to preserve artifacts for successful local runs.

Expected helper additions:

- `tests/e2e/support/test-env.ts`: add fixtures for clean-repo, missing-env,
  and multi-check scenarios,
- `tests/e2e/support/mock-ai-server.ts`: reuse existing per-response `delayMs`
  support for cancellation and staggered parallel responses,
- `tests/e2e/support/failure-artifacts.ts`: add one small utility that writes
  transcript, screen, requests, logs, and copied artifact directories on
  failure.

Phase 5 is complete when:

- terminal E2Es cover cancellation, startup failure, empty-scope behavior, and
  parallel multi-check scans,
- prompt regressions are reviewable as normalized golden diffs,
- a failing CI run leaves enough artifacts to debug without reproducing the
  failure locally first.

## Why not make Docker E2E phase 1

Defer Docker E2E until after native E2E is stable.

Reasons:

- the repo already has unit and integration coverage around Docker handoff,
- Docker adds another process boundary and image and setup cost,
- terminal flakiness and provider flakiness should not be debugged at the same
  time.

Planned later additions:

- one smoke E2E for `--runtime docker`,
- one prompt-capture verification in Docker mode,
- parity assertions between native and Docker outputs.

## Build and execution strategy

Phase 1 will execute the repo-local `shrike` wrapper in the PTY.

Why:

- it follows the same user-facing CLI entrypoint,
- it uses `tsx src/cli.ts` automatically in a source checkout,
- it avoids making the first E2E lane depend on a prebuild step.

Follow-up:

- add one later smoke test that explicitly runs the built `dist/cli.js` path,
- keep existing unit and integration tests on source imports.

## CI strategy

Stage rollout in two layers:

- default PR suite keeps the current fast Vitest tests,
- a separate E2E project or job runs terminal tests.

Initial CI target:

- Linux only

After stabilization:

- macOS
- optionally Windows, once PTY behavior is characterized

Failure artifacts should include:

- raw transcript,
- normalized terminal snapshot,
- mock AI request log,
- temp repo path or saved fixture bundle,
- `.openshrike/artifacts` contents when present.

## Proposed file-level rollout

Implementation is expected to touch:

- `package.json`
- `vitest.config.ts` or a dedicated `vitest.e2e.config.ts`
- `tests/e2e/**`
- possibly shared test helpers under `tests/support/**`
- CI workflow files
- developer docs and the README test section

No application code changes should be required for the first pass unless we
discover a testability gap.

## Success criteria

The first accepted E2E lane should satisfy all of the following:

- no live network dependency,
- no dependency on user-global OpenCode state,
- deterministic prompt capture and assertion,
- stable PTY assertions without arbitrary sleeps,
- one-command local execution,
- actionable failure artifacts in CI.

## Decision

Recommended implementation path:

- keep Vitest,
- use the `node-pty` PTY model plus `@xterm/headless`,
- build a small custom E2E harness,
- use a real local mock AI HTTP server,
- configure OpenCode through repo-local config and isolated XDG state,
- start with native `scan`,
- add `fix` after the scan path proves stable,
- add `init` and Docker in later phases.
