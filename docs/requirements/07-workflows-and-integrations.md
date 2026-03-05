# Workflows and Integrations

## Local developer workflow (MVP)
- Run a scan against a repo or diff.
- Assemble selected checks into an opencode skill for execution.
- Produce a report and a machine-readable feedback file.
- Review findings and act on them manually or feed to an external agent.

## CI workflow
- Trigger on pull request events.
- Run in isolated containers with no external network by default.
- Publish findings as PR comments or artifacts.

## Agent feedback loop (Phase 2)
- Export findings in a format that can be ingested by Codex, Claude Code, or
  other agent frameworks.
- Support "iterate until clean" workflows with retry limits and guardrails.
- Define failure modes: loop detection, conflicting fixes, and gaming prevention.

Note: MVP produces structured JSON output for external consumption but does not
orchestrate the iteration loop itself. That is a Phase 2 feature.

## Integration surfaces
- CLI for local and CI use.
- GitHub/GitLab integration via CI steps and optional comments.
- Webhook or JSON output for downstream systems.

## Configuration model
- Policy selection via config file or CLI flags.
- Enable/disable individual checks and set overrides.
- Environment-specific overrides for security posture.
- Explicit tool allowlist for agent runtime.
