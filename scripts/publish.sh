#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/publish.sh [options]

Options:
  --mode <framework|self-contained|both>   Publish mode (default: both)
  --rid <runtime-id>                       Runtime ID for self-contained publish (default: linux-x64)
  --configuration <Debug|Release>          Build configuration (default: Release)
  --output-root <path>                     Output root directory (default: .artifacts/publish)

Examples:
  scripts/publish.sh --mode self-contained --rid linux-x64
  scripts/publish.sh --mode framework
  scripts/publish.sh --mode both --rid osx-arm64
EOF
}

MODE="both"
RID="linux-x64"
CONFIGURATION="Release"
OUTPUT_ROOT=".artifacts/publish"
PROJECT="src/OpenShrike.Cli/OpenShrike.Cli.csproj"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --rid)
      RID="${2:-}"
      shift 2
      ;;
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

case "$MODE" in
  framework|self-contained|both) ;;
  *)
    echo "Invalid --mode: $MODE" >&2
    usage
    exit 1
    ;;
esac

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRAMEWORK_OUT="$OUTPUT_ROOT/framework"
SELF_OUT="$OUTPUT_ROOT/self-contained/$RID"

publish_framework() {
  echo "Publishing framework-dependent build to $FRAMEWORK_OUT"
  rm -rf "$FRAMEWORK_OUT"
  mkdir -p "$FRAMEWORK_OUT"

  dotnet publish "$PROJECT" \
    -c "$CONFIGURATION" \
    --self-contained false \
    -o "$FRAMEWORK_OUT/app"

  cat > "$FRAMEWORK_OUT/shrike" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec dotnet "$SCRIPT_DIR/app/OpenShrike.Cli.dll" "$@"
EOF
  chmod +x "$FRAMEWORK_OUT/shrike"
}

publish_self_contained() {
  echo "Publishing self-contained single-file build for $RID to $SELF_OUT"
  rm -rf "$SELF_OUT"
  mkdir -p "$SELF_OUT"

  dotnet publish "$PROJECT" \
    -c "$CONFIGURATION" \
    -r "$RID" \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:PublishTrimmed=false \
    -o "$SELF_OUT"

  if [[ "$RID" == win-* ]]; then
    cp "$SELF_OUT/OpenShrike.Cli.exe" "$SELF_OUT/shrike.exe"
  else
    cp "$SELF_OUT/OpenShrike.Cli" "$SELF_OUT/shrike"
    chmod +x "$SELF_OUT/shrike"
  fi
}

if [[ "$MODE" == "framework" || "$MODE" == "both" ]]; then
  publish_framework
fi

if [[ "$MODE" == "self-contained" || "$MODE" == "both" ]]; then
  publish_self_contained
fi

echo
echo "Publish complete."
echo "Framework output:      $FRAMEWORK_OUT"
echo "Self-contained output: $SELF_OUT"
