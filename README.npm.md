# @networkperspective/openshrike

OpenShrike is a security-first agentic code reviewer and best-practice auditor
built on OpenCode.

## Install

Prerequisite: Node.js 22+.

```bash
npm install -g @networkperspective/openshrike
```

## Quick start

```bash
shrike init
shrike scan
```

## What ships in this package

- the `shrike` CLI entry point
- bundled best-practice checks under `best_practices/`
- the system prompts used by `shrike scan` and `shrike fix`

## VS Code extension

If you want the VS Code UI, install `networkperspective.openshrike` from the
Visual Studio Code Marketplace.

```bash
code --install-extension networkperspective.openshrike
```
## Links

- GitHub: https://github.com/Network-Perspective/OpenShrike
- Website: https://network-perspective.github.io/OpenShrike/
- VSCode: https://marketplace.visualstudio.com/items?itemName=NetworkPerspective.openshrike
