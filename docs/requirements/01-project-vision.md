# Project Vision

## One-liner
OpenShrike is a self-hosted, security-first agentic code reviewer that
evaluates code and development artifacts against a curated library of best
practices, then feeds actionable feedback back to software agents and humans.

## Problem statement
- Traditional linters catch syntax and low-level style issues but miss
  architecture, lifecycle, and operational best practices.
- Agentic development produces more artifacts, faster, and requires continuous
  oversight to prevent accumulating technical debt.
- Most AI review tooling is cloud-hosted and opaque, which is unacceptable for
  sensitive codebases.

## Vision goals
- Provide an on-prem reviewer that can run tests, search code, and reason about
  system-level risks.
- Make best practices a versioned, customizable, auditable library assembled
  into skills/bundles for efficient execution.
- Enable a closed feedback loop so agents iterate until checks are met.
- Offer observability across agent behavior and assessment coverage.

## Non-goals (initially)
- Replace full human code review.
- Serve as a general-purpose CI system.
- Provide a hosted SaaS offering.

## Target users
- Engineering teams that use agentic workflows in local or CI environments.
- Security-conscious organizations that need hard isolation from external calls.
- Platform teams that want policy-as-data to enforce SDLC best practices.

## Success criteria
- Demonstrably reduces recurring best-practice violations in agent-authored PRs.
- Produces actionable feedback with evidence and remediation guidance.
- Operates without exposing secrets or breaking isolation guarantees.
