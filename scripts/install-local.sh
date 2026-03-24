#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/install-local.sh [options]

Options:
  --source <path>            Source launcher or published framework directory
                             (default: ./shrike)
  --bin-dir <path>           Install directory (default: ~/.local/bin)
  --install-root <path>      Install root for copied bundles
                             (default: ~/.local/share/openshrike/current)
  --link                     Symlink instead of copy
  -h, --help                 Show this help

Examples:
  scripts/install-local.sh --source .artifacts/publish/framework --link
  scripts/install-local.sh --source .artifacts/publish/framework
  scripts/install-local.sh --source ./shrike --link
EOF
}

SOURCE="./shrike"
BIN_DIR="${HOME}/.local/bin"
INSTALL_ROOT="${HOME}/.local/share/openshrike/current"
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
    --install-root)
      INSTALL_ROOT="${2:-}"
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
if [[ -d "$SOURCE_PATH" ]]; then
  SOURCE_ROOT="$SOURCE_PATH"
  SOURCE_ENTRY="$SOURCE_ROOT/shrike"
else
  SOURCE_ENTRY="$SOURCE_PATH"
  SOURCE_ROOT="$(dirname "$SOURCE_ENTRY")"
fi

TARGET_PATH="$BIN_DIR/shrike"

if [[ ! -e "$SOURCE_ENTRY" ]]; then
  echo "Source path does not exist: $SOURCE_ENTRY" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

if [[ "$LINK_MODE" == "true" ]]; then
  ln -sf "$SOURCE_ENTRY" "$TARGET_PATH"
  echo "Linked $TARGET_PATH -> $SOURCE_ENTRY"
else
  rm -rf "$INSTALL_ROOT"
  mkdir -p "$INSTALL_ROOT"
  cp -a "$SOURCE_ROOT"/. "$INSTALL_ROOT"/

  cat > "$TARGET_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$INSTALL_ROOT/$(basename "$SOURCE_ENTRY")" "\$@"
EOF
  chmod +x "$TARGET_PATH"
  echo "Installed $TARGET_PATH with bundle root $INSTALL_ROOT"
fi

echo
echo "If '$BIN_DIR' is not in PATH, add this to your shell profile:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""
