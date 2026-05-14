# Workflows and Integrations

## Local developer workflow
- Run a scan against a repo or diff.
- Assemble selected checks into an opencode skill for execution.
- Produce a report and a machine-readable feedback file.
- Review findings and act on them manually, fix them inside Shrike, or feed
  them to an external agent.
- Choose `--runtime native` for the fast local loop or `--runtime docker` to
  match the isolated worker path.

## CI workflow
- Trigger on pull request events.
- Prefer `--runtime docker` for isolated worker execution and stable parity with
  local Docker runs.
- Publish findings as PR comments or artifacts.

## Agent feedback loop
- Support `Recheck` and `Fix` inside `shrike scan` for a selected check.
- Support sequential `shrike fix` runs over all failing checks.
- Export findings in a format that can still be ingested by Codex, Claude Code,
  or other agent frameworks.
- Support resume-from-state flows via `--last-scan`.
- Define failure modes: stale results, conflicting edits, loop detection, and
  gaming prevention.

## Integration surfaces
- CLI for local and CI use.
- GitHub/GitLab integration via CI steps and optional comments.
- Webhook or JSON output for downstream systems.
- Streamed runtime events and worker progress for local UI and CI logs.

## Configuration model
- Policy selection via config file or CLI flags.
- Enable/disable individual checks and set overrides.
- Environment-specific overrides for security posture.
- Explicit tool allowlist for agent runtime.
- Runtime mode selection via CLI: `native` or `docker`.
