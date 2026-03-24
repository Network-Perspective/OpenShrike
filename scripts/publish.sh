#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/publish.sh [options]

Options:
  --configuration <Debug|Release>          Accepted for compatibility, ignored
  --output-root <path>                     Output root directory (default: .artifacts/publish)

Examples:
  scripts/publish.sh
  scripts/publish.sh --output-root /tmp/openshrike-publish
EOF
}

CONFIGURATION="Release"
OUTPUT_ROOT=".artifacts/publish"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration)
      CONFIGURATION="${2:-}"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="${2:-}"
      shift 2
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

FRAMEWORK_OUT="$OUTPUT_ROOT/framework"
APP_OUT="$FRAMEWORK_OUT/app"

echo "Publishing framework bundle to $FRAMEWORK_OUT"
echo "Configuration flag received: $CONFIGURATION"

rm -rf "$FRAMEWORK_OUT"
mkdir -p "$APP_OUT"

npm install
npm run build

cp package.json package-lock.json "$APP_OUT"/
cp -a dist "$APP_OUT"/
cp -a node_modules "$APP_OUT"/
cp -a best_practices "$APP_OUT"/
if [[ -d .openshrike ]]; then
  cp -a .openshrike "$APP_OUT"/
fi

cat > "$FRAMEWORK_OUT/shrike" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd -P -- "$(dirname -- "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P -- "$(dirname -- "$SOURCE")" && pwd)"
exec node "$SCRIPT_DIR/app/dist/cli.js" "$@"
EOF
chmod +x "$FRAMEWORK_OUT/shrike"

echo
echo "Publish complete."
echo "Framework output:      $FRAMEWORK_OUT"
