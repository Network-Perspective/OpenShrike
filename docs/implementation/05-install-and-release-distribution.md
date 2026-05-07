# Install And Release Distribution

Status: implemented

Scope:

- root install entry points: `install`, `install.ps1`
- release bundle packaging: `scripts/publish.sh`
- local release preparation: `scripts/create-release.sh`
- GitHub release automation: `.github/workflows/release-bundles.yml`

Primary implementation:

- `install`
- `install.ps1`
- `scripts/publish.sh`
- `scripts/create-release.sh`
- `.github/workflows/release-bundles.yml`

## Summary

OpenShrike now ships two user-facing bootstrap installers:

1. `install` for Unix shells, intended for `curl ... | bash`
2. `install.ps1` for PowerShell on Windows

Both installers try to download a prebuilt release bundle from the repository's
GitHub Releases first. If a matching asset is not available, they fall back to
building a release-shaped bundle from the tagged source archive on the target
machine.

The release bundle is a self-contained application directory with:

- a launcher at the bundle root,
- `app/dist/cli.js`,
- production-only `app/node_modules/`,
- bundled `best_practices/`,
- simple metadata files: `TARGET` and `VERSION`.

The installer is intentionally not an npm-global installer. It installs a
versioned application directory under a user-owned location and writes a small
launcher shim onto the user's `PATH`.

## Unix Installer

Entry point: `install`

Default layout:

- bin dir: `~/.local/bin`
- install root: `${XDG_DATA_HOME:-~/.local/share}/openshrike`
- versioned releases: `.../releases/<version>`
- active launcher: `~/.local/bin/shrike`

Behavior:

1. parse flags such as `--version`, `--source-only`, `--bin-dir`,
   `--install-dir`, and `--no-modify-path`,
2. detect the current target tuple: `linux-x64`, `linux-arm64`, `darwin-x64`,
   or `darwin-arm64`,
3. resolve the latest GitHub release unless the user pinned a version,
4. try to download `openshrike-<target>.tar.gz`,
5. extract the archive into a versioned release directory and update the
   symlink-based launcher,
6. if the asset is missing, download the GitHub source archive and build a
   local bundle with `scripts/publish.sh`,
7. optionally append the bin dir to the user's shell startup file.

## Windows Installer

Entry point: `install.ps1`

Default layout:

- bin dir: `%LOCALAPPDATA%\OpenShrike\bin`
- install root: `%LOCALAPPDATA%\OpenShrike`
- versioned releases: `%LOCALAPPDATA%\OpenShrike\releases\<version>`
- active launchers:
  - `shrike.cmd`
  - `shrike.ps1`

Behavior:

1. parse PowerShell parameters such as `-Version`, `-SourceOnly`, `-BinDir`,
   `-InstallDir`, and `-NoModifyPath`,
2. detect the current target tuple: `windows-x64` or `windows-arm64`,
3. resolve the latest GitHub release unless the user pinned a version,
4. try to download `openshrike-<target>.zip`,
5. extract the archive into a versioned release directory and rewrite small
   forwarding shims in the bin dir,
6. if the asset is missing, download the GitHub source archive as `.zip`,
   build the bundle locally with `npm ci` and `npm run build`, then stage
   production dependencies with `npm ci --omit=dev`,
7. optionally append the bin dir to the user-level Windows `Path`.

Windows uses copied shims rather than symlinks because user-writable symlinks
cannot be assumed.

## Release Bundle Format

### Unix bundles

- archive: `openshrike-<target>.tar.gz`
- launcher: `shrike`

The launcher resolves its own directory and executes:

```text
node <bundle>/app/dist/cli.js
```

### Windows bundles

- archive: `openshrike-<target>.zip`
- launchers:
  - `shrike.cmd`
  - `shrike.ps1`

The bundle launchers invoke the same `app/dist/cli.js` entry point through
`node`, but use Windows-native wrapper formats.

## Packaging Rules

`scripts/publish.sh` creates the release bundle in two stages:

1. run `npm ci` and `npm run build` in the repo root,
2. create a clean runtime staging directory and run `npm ci --omit=dev`,
3. remove runtime cache artifacts that should not be shipped:
   - `node_modules/.package-lock.json`
   - `node_modules/opencode-ai/bin/.opencode`
4. assemble the final package directory under `package/openshrike`,
5. emit either:
   - `.tar.gz` for Unix targets, or
   - `.zip` for Windows targets.

The explicit removal of `.opencode` matters because that file is a
host-generated cache produced by `opencode-ai` postinstall. Shipping it would
freeze the bundle to the build host's OpenCode binary choice instead of letting
the runtime wrapper resolve the correct binary on the target machine.

## Release Workflow

Workflow: `.github/workflows/release-bundles.yml`

On `v*` tags, the workflow builds and uploads release assets for:

- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`
- `windows-x64`

Each job runs `scripts/publish.sh --target <target>` on the matching
GitHub-hosted runner and publishes the resulting archive into the tagged GitHub
Release.

## Local Release Preparation

Helper: `scripts/create-release.sh`

This helper exists to leave only `git push` as a manual step.

Default behavior:

1. compute the next patch version from `package.json`,
2. run `npm version <computed-version> --no-git-tag-version`,
3. stage the full repository with `git add -A`,
4. create commit `chore(release): v<version>`,
5. create annotated tag `v<version>`.

The script also accepts:

- `minor`
- `major`
- an explicit version such as `0.3.0`

It intentionally stages all current changes, including new files, because the
goal is to turn the current release-ready worktree into a tagged release
commit.

## Intentional Constraints

- Node.js 22+ remains a hard prerequisite for both installers.
- The installer does not attempt machine-wide installation.
- Linux and macOS use symlink-based activation; Windows uses rewritten shims.
- The fallback source build path is present so the installer still works before
  a release asset exists for a target or version.
