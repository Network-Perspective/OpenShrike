#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/publish-vscode.sh [options]

Options:
  --package-path <path>                    VSIX path to create or publish
  --skip-build                             Publish an existing VSIX without rebuilding it
  -h, --help                               Show this help message

Defaults:
  package path: .artifacts/vscode/networkperspective.openshrike-<version>.vsix

Environment:
  VSCE_PAT                                 Optional Visual Studio Marketplace access token

Behavior:
  - runs `npm ci`
  - runs `npm run build`
  - packages a VSIX with `@vscode/vsce`
  - publishes the VSIX with `@vscode/vsce`
  - uses `VSCE_PAT` when available, otherwise falls back to Azure identity

Examples:
  scripts/publish-vscode.sh
  scripts/publish-vscode.sh --skip-build --package-path .artifacts/vscode/my.vsix
EOF
}

PACKAGE_PATH=""
SKIP_BUILD="false"

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

command -v node >/dev/null 2>&1 || {
  echo "node is required." >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "npm is required." >&2
  exit 1
}

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
  npm exec --yes @vscode/vsce@3 -- package --out "$PACKAGE_PATH"
fi

if [[ ! -f "$PACKAGE_PATH" ]]; then
  echo "Could not find VSIX package at '$PACKAGE_PATH'." >&2
  exit 1
fi

echo "Publishing VS Code extension from $PACKAGE_PATH"
PUBLISH_ARGS=(publish --packagePath "$PACKAGE_PATH")

if [[ -n "${VSCE_PAT:-}" ]]; then
  echo "Using VSCE_PAT for Visual Studio Marketplace authentication"
else
  echo "VSCE_PAT is not set; falling back to Azure identity authentication"
  PUBLISH_ARGS+=(--azure-credential)
fi

npm exec --yes @vscode/vsce@3 -- "${PUBLISH_ARGS[@]}"
