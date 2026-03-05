# OpenShrike

Self-hosted, security-first agentic code reviewer and best-practice auditor.
Local and CI use, wrapping an agent runtime that can run tests, search the
codebase, and provide higher-level feedback on design, maintainability, and
process quality. Policies are authored as data and assembled into skills/bundles
so only the relevant checks are executed and reported. The system is meant to
close the loop by feeding structured results back into developer agents (Codex,
Claude Code, etc.) until checks are satisfied.

This repo currently contains only planning documents: requirements, feature
descriptions, and example best-practice definitions.

## Why this exists

As software development shifts to agent-driven workflows, we need observability
and governance over those agents. This project aims to:
- Detect higher-level code smells and architectural risks that linters miss.
- Enforce a growing library of best practices across the whole SDLC.
- Provide a secure, auditable execution environment for analysis agents.
- Create a feedback loop so agents can iteratively fix what is found.

## Guiding principles

- Security first: no secrets to agents; deterministic isolation for all CLI runs.
- Local-first and self-hosted: no vendor lock-in and no hidden outbound calls.
- Explainability: every finding has evidence, rationale, and remediation steps.
- Extensible best practices: policy-as-data assembled into skills/bundles.
- Observability: agent behavior is inspectable, traceable, and reproducible.

## Document map

- [Vision and scope](docs/requirements/01-project-vision.md)
- [Feature scope and phases](docs/requirements/02-feature-scope.md)
- [Security model](docs/requirements/03-security-model.md)
- [Agent runtime and isolation](docs/requirements/04-agent-runtime.md)
- [Best practices library](docs/requirements/05-best-practices-library.md)
- [Observability and feedback loop](docs/requirements/06-observability.md)
- [Workflows and integrations](docs/requirements/07-workflows-and-integrations.md)

## Imagined usage (non-functional sketch)

Local review:

```bash
shrike scan --policy baseline --repo .
```

CI review on a pull request:

```bash
shrike scan --policy baseline --diff origin/main...HEAD
```

Feedback loop to an agent:

```bash
shrike review --policy baseline --emit agent-feedback.json
```

## Next step

Refine requirements in the docs, agree on scope and a name, then design the
initial architecture and threat model before writing any code.
