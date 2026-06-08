# VS Code Extension Development Workflow

Date: 2026-06-08

Status: implemented

Scope:

- source-based local development of the OpenShrike VS Code extension
- extension build and launch workflow
- edit and reload loop during development
- current supported capabilities and remaining gaps

Primary files involved:

- `package.json`
- `tsup.extension.config.ts`
- `.vscode/launch.json`
- `src/vscode/**`

## Summary

The VS Code extension is functional and can run scans, load saved scan state,
open evidence and check markdown, and drive recheck and fix actions from the
editor.

The supported developer workflow is still source-based. Build the extension
bundle from this repository and run it in an Extension Development Host. Release
automation now also produces a VSIX and publishes the Marketplace build, but
the fastest development loop is still source-based.

## Prerequisites

- Node.js 22+
- desktop VS Code `1.101+`
- this repository opened as the active workspace root in VS Code
- `npm install` run at least once in the repository

## Current status

The extension currently provides:

- Activity Bar container: `OpenShrike`
- `Summary` and `Checks` views
- detail panel in a native editor tab
- output channel
- status bar item
- command palette entries and toolbar actions for scan, load last scan,
  scope/runtime changes, evidence navigation, recheck, and fix

Known gaps:

- development is still validated primarily through the Extension Development
  Host
- remote-host packaging coverage (SSH, WSL, dev containers) still needs
  explicit verification

## Fastest local workflow

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Build the extension bundle

```bash
npm run build:extension
```

This compiles `src/vscode/extension.ts` into:

```text
dist/vscode/extension.cjs
```

### 3. Launch the extension in VS Code

Open the repository in VS Code and use the built-in debug configuration:

- open **Run and Debug**
- select `OpenShrike VS Code Extension`
- press `F5`

VS Code opens a second window titled as an **Extension Development Host**.
That second window is the one that loads the local OpenShrike extension.

## What to expect in the development host

In the Extension Development Host window you should see:

- an `OpenShrike` icon in the Activity Bar
- `Summary` and `Checks` views
- a detail panel when a finding is selected
- an `OpenShrike` output channel
- a status bar item reflecting active scan state

The main command surfaces are live in the development host, including running
scans, loading the last scan, changing scope/runtime defaults, opening
evidence, opening check markdown, rechecking, and fixing the selected finding.

## Edit and reload loop

### Code-only changes

For TypeScript changes under `src/vscode/**`:

1. rebuild the extension:

```bash
npm run build:extension
```

2. in the Extension Development Host, run:

```text
Developer: Reload Window
```

That reloads the host window and picks up the rebuilt extension bundle.

### Faster rebuild loop

If you are iterating quickly, run the extension bundler in watch mode:

```bash
npm run dev:extension
```

Then keep using `Developer: Reload Window` in the Extension Development Host
after each rebuild.

### Manifest changes

If you change extension contributions in `package.json`:

- stop the current debug session
- relaunch `OpenShrike VS Code Extension` from **Run and Debug**

Manifest changes are read at startup and are not as reliable with a simple
window reload.

## Troubleshooting

### The OpenShrike view does not appear

Check these first:

- you launched `OpenShrike VS Code Extension`, not the main workspace window
- the extension bundle built successfully
- the repository root is the opened workspace
- the Activity Bar is visible

### The prelaunch build does not run

Run the build manually once:

```bash
npm run build:extension
```

Then relaunch the debug configuration.

### I changed code but nothing updated

Make sure you reloaded the **Extension Development Host** window, not the main
editing window.

### I want this in my normal VS Code profile

Install the Marketplace release or a VSIX produced by the release workflow if
you want the extension in a normal VS Code profile. For local iteration in this
repository, the supported and fastest loop is still the Extension Development
Host.

## Recommended review loop

Use this exact sequence:

```bash
npm install
npm run build:extension
```

Then in VS Code:

1. open **Run and Debug**
2. select `OpenShrike VS Code Extension`
3. press `F5`
4. exercise the extension in the Extension Development Host
5. rebuild and reload as needed

That is the current supported way to run and iterate on the OpenShrike VS Code
extension locally.
