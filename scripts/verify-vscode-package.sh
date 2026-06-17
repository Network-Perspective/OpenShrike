#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/verify-vscode-package.sh --vsix-path <path> [options]

Options:
  --vsix-path <path>                      VSIX package to validate
  --require-docker                       Fail if Docker is unavailable for the smoke test
  --skip-docker                          Skip the Docker smoke test even if Docker is installed
  -h, --help                             Show this help message
EOF
}

VSIX_PATH=""
REQUIRE_DOCKER="false"
SKIP_DOCKER="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vsix-path)
      VSIX_PATH="${2:-}"
      shift 2
      ;;
    --require-docker)
      REQUIRE_DOCKER="true"
      shift
      ;;
    --skip-docker)
      SKIP_DOCKER="true"
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

if [[ -z "$VSIX_PATH" ]]; then
  echo "--vsix-path is required." >&2
  usage >&2
  exit 1
fi

if [[ "$VSIX_PATH" != /* ]]; then
  VSIX_PATH="$ROOT_DIR/$VSIX_PATH"
fi

[[ -f "$VSIX_PATH" ]] || {
  echo "Could not find VSIX package at '$VSIX_PATH'." >&2
  exit 1
}

command -v unzip >/dev/null 2>&1 || {
  echo "unzip is required to verify the VSIX package." >&2
  exit 1
}

TEMP_DIR="$(mktemp -d)"
IMAGE_TAG=""

cleanup() {
  rm -rf "$TEMP_DIR"
  if [[ -n "$IMAGE_TAG" ]] && command -v docker >/dev/null 2>&1; then
    docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

unzip -q "$VSIX_PATH" -d "$TEMP_DIR"

EXTENSION_DIR="$TEMP_DIR/extension"
DOCKERFILE_PATH="$EXTENSION_DIR/docker/openshrike-runtime.Dockerfile"
LOCKFILE_PATH="$EXTENSION_DIR/docker/openshrike-runtime.package-lock.json"

[[ -d "$EXTENSION_DIR" ]] || {
  echo "VSIX '$VSIX_PATH' did not unpack an extension/ directory." >&2
  exit 1
}

[[ -f "$DOCKERFILE_PATH" ]] || {
  echo "VSIX '$VSIX_PATH' is missing extension/docker/openshrike-runtime.Dockerfile." >&2
  exit 1
}

[[ -f "$LOCKFILE_PATH" ]] || {
  echo "VSIX '$VSIX_PATH' is missing extension/docker/openshrike-runtime.package-lock.json." >&2
  exit 1
}

grep -Fqx 'COPY docker/openshrike-runtime.package-lock.json ./package-lock.json' "$DOCKERFILE_PATH" || {
  echo "VSIX '$VSIX_PATH' contains a Dockerfile that does not copy docker/openshrike-runtime.package-lock.json." >&2
  exit 1
}

if [[ "$SKIP_DOCKER" == "true" ]]; then
  echo "Skipping Docker smoke test for '$VSIX_PATH'."
  echo "VSIX runtime assets verified: $VSIX_PATH"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  if [[ "$REQUIRE_DOCKER" == "true" ]]; then
    echo "Docker is required to smoke-test '$VSIX_PATH', but it was not found." >&2
    exit 1
  fi

  echo "Docker is not installed. Skipping Docker smoke test for '$VSIX_PATH'."
  echo "VSIX runtime assets verified: $VSIX_PATH"
  exit 0
fi

IMAGE_TAG="openshrike-vsix-smoke-$(date +%s)-$$"
echo "Running Docker smoke test for '$VSIX_PATH'"
docker build --tag "$IMAGE_TAG" --file "$DOCKERFILE_PATH" "$EXTENSION_DIR"

echo "VSIX runtime assets verified: $VSIX_PATH"
