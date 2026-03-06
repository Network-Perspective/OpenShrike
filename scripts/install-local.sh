#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/install-local.sh [options]

Options:
  --source <path>            Source executable/script to install
                             (default: ./shrike)
  --bin-dir <path>           Install directory (default: ~/.local/bin)
  --link                     Symlink instead of copy
  -h, --help                 Show this help

Examples:
  scripts/install-local.sh --source .artifacts/publish/self-contained/linux-x64/shrike
  scripts/install-local.sh --source .artifacts/publish/framework/shrike --link
  scripts/install-local.sh --source ./shrike --link
EOF
}

SOURCE="./shrike"
BIN_DIR="${HOME}/.local/bin"
LINK_MODE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="${2:-}"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="${2:-}"
      shift 2
      ;;
    --link)
      LINK_MODE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SOURCE_PATH="$(realpath "$SOURCE")"
TARGET_PATH="$BIN_DIR/shrike"

if [[ ! -e "$SOURCE_PATH" ]]; then
  echo "Source path does not exist: $SOURCE_PATH" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

if [[ "$LINK_MODE" == "true" ]]; then
  ln -sf "$SOURCE_PATH" "$TARGET_PATH"
  echo "Linked $TARGET_PATH -> $SOURCE_PATH"
else
  cp -f "$SOURCE_PATH" "$TARGET_PATH"
  chmod +x "$TARGET_PATH"
  echo "Installed $TARGET_PATH from $SOURCE_PATH"
fi

echo
echo "If '$BIN_DIR' is not in PATH, add this to your shell profile:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""
