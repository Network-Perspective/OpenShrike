# VS Code Extension Development Workflow

Date: 2026-05-18

Status: implemented

Scope:

- local review of the OpenShrike VS Code mockup
- extension build and launch workflow
- edit and reload loop during development
- current limitations of the mock-only extension shell

Primary files involved:

- `package.json`
- `tsup.extension.config.ts`
- `.vscode/launch.json`
- `src/vscode/**`

## Summary

The current VS Code work is a local development mockup, not a packaged
extension release.

That means the normal workflow is:

1. open this repository in desktop VS Code,
2. build the extension bundle,
3. launch an Extension Development Host,
4. review the mock UI there,
5. reload the development host as you change the mock implementation.

For now, do not think of this as "installing OpenShrike into your main VS Code
profile." The extension is meant to be run from source while the UI is still
being designed.

## Prerequisites

- Node.js 22+
- desktop VS Code `1.101+`
- this repository opened as the active workspace root in VS Code
- `npm install` run at least once in the repository

## Current mockup status

The extension currently provides a real VS Code shell with fake data:

- Activity Bar container: `OpenShrike`
- findings tree
- detail preview in a native editor tab
- output channel
- status bar item
- command palette entries and toolbar buttons

Current limitations:

- findings are static mock data,
- buttons and commands are placeholders only,
- scan execution is not wired,
- evidence links are not wired,
- check markdown opening is not wired,
- there is no VSIX packaging flow yet.

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
- select `OpenShrike Mockup`
- press `F5`

VS Code opens a second window titled as an **Extension Development Host**.
That second window is the one that loads the local OpenShrike extension.

## What to expect in the development host

In the Extension Development Host window you should see:

- an `OpenShrike` icon in the Activity Bar,
- a `Findings` view with grouped mock results,
- a `Detail` view showing the selected finding,
- an `OpenShrike` output channel,
- a status bar item summarizing the mock results.

The command surfaces are present so layout and information hierarchy can be
reviewed, but invoking them should only show placeholder messages.

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

- stop the current debug session,
- relaunch `OpenShrike Mockup` from **Run and Debug**.

Manifest changes are read at startup and are not as reliable with a simple
window reload.

## Troubleshooting

### The OpenShrike view does not appear

Check these first:

- you launched `OpenShrike Mockup`, not the main workspace window,
- the extension bundle built successfully,
- the repository root is the opened workspace,
- the Activity Bar is visible.

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

That is not the intended workflow yet.

The current setup is source-driven extension development. If we want a
reviewable install into the normal profile later, the next step is to add a
VSIX packaging workflow and install from that artifact.

## Recommended review loop right now

Use this exact sequence:

```bash
npm install
npm run build:extension
```

Then in VS Code:

1. open **Run and Debug**
2. select `OpenShrike Mockup`
3. press `F5`
4. review the UI in the Extension Development Host
5. rebuild and reload as needed

That is the current supported way to "add" the OpenShrike extension locally
while the mockup is still under active development.
