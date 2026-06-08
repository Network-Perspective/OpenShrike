#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/publish-npm.sh [options]

Options:
  --package-dir <path>                     Publish an existing staged package directory
  --skip-build                             Reuse the staged package directory without rebuilding it
  --tag <tag>                              Publish under a specific npm dist-tag
  --dry-run                                Run npm publish in dry-run mode
  -h, --help                               Show this help message

Defaults:
  package dir: .artifacts/npm/package

Behavior:
  - verifies npm login with `npm whoami`
  - runs `npm ci`
  - runs `npm run build:cli`
  - runs `npm run prepare:npm-package`
  - publishes the staged package directory with `npm publish --access public`

Examples:
  scripts/publish-npm.sh
  scripts/publish-npm.sh --dry-run
  scripts/publish-npm.sh --tag next
  scripts/publish-npm.sh --skip-build --package-dir .artifacts/npm/package
EOF
}

PACKAGE_DIR=".artifacts/npm/package"
SKIP_BUILD="false"
DIST_TAG=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-dir)
      PACKAGE_DIR="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --tag)
      DIST_TAG="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
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

if ! npm whoami >/dev/null 2>&1; then
  echo "npm login is required before publishing. Run 'npm login' and try again." >&2
  exit 1
fi

if [[ -z "$PACKAGE_DIR" ]]; then
  echo "Expected a non-empty value for --package-dir." >&2
  exit 1
fi

if [[ "$PACKAGE_DIR" != /* ]]; then
  PACKAGE_DIR="$ROOT_DIR/$PACKAGE_DIR"
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "Staging npm package in $PACKAGE_DIR"
  npm ci
  npm run build:cli
  npm run prepare:npm-package -- --out-dir "$PACKAGE_DIR"
fi

if [[ ! -f "$PACKAGE_DIR/package.json" ]]; then
  echo "Could not find staged npm package.json in '$PACKAGE_DIR'." >&2
  exit 1
fi

PACKAGE_NAME="$(node -p "require(process.argv[1]).name" "$PACKAGE_DIR/package.json")"
PACKAGE_VERSION="$(node -p "require(process.argv[1]).version" "$PACKAGE_DIR/package.json")"

PUBLISH_ARGS=(publish "$PACKAGE_DIR" --access public)

if [[ -n "$DIST_TAG" ]]; then
  PUBLISH_ARGS+=(--tag "$DIST_TAG")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  PUBLISH_ARGS+=(--dry-run)
fi

echo "Publishing $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_DIR"
npm "${PUBLISH_ARGS[@]}"
