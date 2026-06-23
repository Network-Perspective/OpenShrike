# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report them privately through one of these channels:

- **GitHub** (preferred): use [Report a vulnerability](https://github.com/Network-Perspective/OpenShrike/security/advisories/new)
  to open a private security advisory. <!-- Requires "Private vulnerability reporting" enabled in repo Settings → Security. -->

Please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested remediation.

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial assessment** (severity and whether we can reproduce) within 10
  business days.
- **Coordinated disclosure:** we will agree on a disclosure timeline with you
  and credit you in the release notes unless you ask us not to.

Please give us a reasonable opportunity to fix the issue before any public
disclosure.

## Supported versions

Security fixes are applied to the latest released version. We recommend always
running the most recent [release](https://github.com/Network-Perspective/OpenShrike/releases/latest).

| Version        | Supported          |
| -------------- | ------------------ |
| Latest release | :white_check_mark: |
| Older releases | :x:                |

<!-- TODO: if you adopt a longer support window or LTS line, document it here. -->

## Scope and threat model

OpenShrike is a self-hosted tool that orchestrates an LLM to run repo-local
checks against your code. A few project-specific notes for reporters:

- **Bring Your Own Key (BYOK).** OpenShrike sends the diff under review and the
  relevant check definitions to the model provider you configure, under your
  own key. Data handling by a hosted provider (OpenAI, Anthropic, Bedrock,
  Azure, …) is governed by that provider's policy and is out of scope. Issues
  in how OpenShrike *selects, scopes, or transmits* that data are in scope.
- **Install script.** The `curl … | bash` and PowerShell installers execute
  remote code by design. Reports about integrity of the install path
  (e.g. tampering, unpinned fetches, privilege escalation during install) are
  in scope.
- **`docker` runtime.** This isolates check *execution*; it does not by itself
  restrict outbound network access from the model call. Sandbox-escape or
  isolation-bypass issues are in scope.
- **Generated `.openshrike/` config and checks.** Issues such as secret leakage
  into config, or check content that can trigger unintended command execution,
  are in scope.

Out of scope: vulnerabilities in third-party dependencies that are already
publicly disclosed (please report those upstream), and the data-handling
practices of model providers themselves.

## Handling of secrets

OpenShrike is designed not to persist provider credentials in committed files.
If you find a path where keys, tokens, or other secrets are written to a
tracked file, logged, or transmitted to an unintended destination, treat it as
a security issue and report it privately using the channels above.
