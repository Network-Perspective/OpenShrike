#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/package-vscode.sh [options]

Options:
  --package-path <path>                    VSIX path to create
  --skip-build                             Reuse an existing VSIX without rebuilding it
  --skip-install                           Create/verify the VSIX without installing it
  -h, --help                               Show this help message

Defaults:
  package path: .artifacts/vscode/networkperspective.openshrike-<version>.vsix

Environment:
  VSCODE_BIN                               VS Code CLI to use for local installation (default: code)

Behavior:
  - runs `npm ci`
  - runs `npm run build`
  - runs `npm run prepare:vscode-runtime`
  - runs `npm run verify:vscode-runtime`
  - packages a VSIX with `@vscode/vsce`
  - validates the packaged Docker runtime assets
  - force installs the VSIX into the local VS Code instance

Examples:
  scripts/package-vscode.sh
  scripts/package-vscode.sh --package-path .artifacts/vscode/my.vsix
  scripts/package-vscode.sh --skip-install
  scripts/package-vscode.sh --skip-build --package-path .artifacts/vscode/my.vsix
EOF
}

PACKAGE_PATH=""
SKIP_BUILD="false"
SKIP_INSTALL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-path)
      PACKAGE_PATH="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VSCODE_BIN="${VSCODE_BIN:-code}"

command -v node >/dev/null 2>&1 || {
  echo "node is required." >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "npm is required." >&2
  exit 1
}

if [[ "$SKIP_INSTALL" != "true" ]]; then
  if [[ "$VSCODE_BIN" == */* ]]; then
    [[ -x "$VSCODE_BIN" ]] || {
      echo "VS Code CLI '$VSCODE_BIN' is not executable." >&2
      exit 1
    }
  else
    command -v "$VSCODE_BIN" >/dev/null 2>&1 || {
      echo "VS Code CLI '$VSCODE_BIN' was not found. Set VSCODE_BIN to override it." >&2
      exit 1
    }
  fi
fi

PACKAGE_VERSION="$(node -p "require('./package.json').version")"

if [[ -z "$PACKAGE_PATH" ]]; then
  PACKAGE_PATH=".artifacts/vscode/networkperspective.openshrike-${PACKAGE_VERSION}.vsix"
fi

if [[ "$PACKAGE_PATH" != /* ]]; then
  PACKAGE_PATH="$ROOT_DIR/$PACKAGE_PATH"
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "Building VSIX at $PACKAGE_PATH"
  mkdir -p "$(dirname "$PACKAGE_PATH")"
  npm ci
  npm run build
  npm run prepare:vscode-runtime
  npm run verify:vscode-runtime
  npm exec --yes @vscode/vsce@3 -- package --readme-path README.vscode.md --out "$PACKAGE_PATH"
fi

if [[ ! -f "$PACKAGE_PATH" ]]; then
  echo "Could not find VSIX package at '$PACKAGE_PATH'." >&2
  exit 1
fi

scripts/verify-vscode-package.sh --vsix-path "$PACKAGE_PATH"

if [[ "$SKIP_INSTALL" != "true" ]]; then
  echo "Installing VSIX into local VS Code with '$VSCODE_BIN'"
  "$VSCODE_BIN" --install-extension "$PACKAGE_PATH" --force
fi

echo "VSIX ready for local testing: $PACKAGE_PATH"
