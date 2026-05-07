#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/publish.sh [options]

Options:
  --configuration <Debug|Release>          Accepted for compatibility, ignored
  --output-root <path>                     Output root directory (default: .artifacts/publish)
  --target <os-arch>                       Asset naming target (default: detected host target)

Examples:
  scripts/publish.sh
  scripts/publish.sh --target linux-x64
  scripts/publish.sh --output-root /tmp/openshrike-publish
EOF
}

CONFIGURATION="Release"
OUTPUT_ROOT=".artifacts/publish"
TARGET=""
APP="openshrike"
TARGET_OS=""
TARGET_ARCH=""

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
    --target)
      TARGET="${2:-}"
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

if [[ -z "$TARGET" ]]; then
  RAW_OS="$(uname -s)"
  RAW_ARCH="$(uname -m)"

  case "$RAW_OS" in
    Linux)
      TARGET_OS="linux"
      ;;
    Darwin)
      TARGET_OS="darwin"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      TARGET_OS="windows"
      ;;
    *)
      echo "Unsupported OS for publish target detection: $RAW_OS" >&2
      exit 1
      ;;
  esac

  case "$RAW_ARCH" in
    x86_64|amd64)
      TARGET_ARCH="x64"
      ;;
    arm64|aarch64)
      TARGET_ARCH="arm64"
      ;;
    *)
      echo "Unsupported architecture for publish target detection: $RAW_ARCH" >&2
      exit 1
      ;;
  esac

  TARGET="${TARGET_OS}-${TARGET_ARCH}"
else
  case "$TARGET" in
    linux-x64|linux-arm64|darwin-x64|darwin-arm64|windows-x64|windows-arm64)
      TARGET_OS="${TARGET%-*}"
      TARGET_ARCH="${TARGET##*-}"
      ;;
    *)
      echo "Unsupported target: $TARGET" >&2
      exit 1
      ;;
  esac
fi

FRAMEWORK_OUT="$OUTPUT_ROOT/framework"
PACKAGE_ROOT="$OUTPUT_ROOT/package/$APP"
APP_OUT="$PACKAGE_ROOT/app"
RUNTIME_STAGE="$OUTPUT_ROOT/runtime-stage"

if [[ "$TARGET_OS" == "windows" ]]; then
  ASSET_PATH="$OUTPUT_ROOT/${APP}-${TARGET}.zip"
else
  ASSET_PATH="$OUTPUT_ROOT/${APP}-${TARGET}.tar.gz"
fi

echo "Publishing framework bundle to $FRAMEWORK_OUT"
echo "Configuration flag received: $CONFIGURATION"
echo "Target identifier: $TARGET"

rm -rf "$FRAMEWORK_OUT" "$OUTPUT_ROOT/package" "$RUNTIME_STAGE" "$ASSET_PATH"
mkdir -p "$APP_OUT" "$RUNTIME_STAGE"

npm ci
npm run build

cp package.json package-lock.json "$RUNTIME_STAGE"/
(
  cd "$RUNTIME_STAGE"
  npm ci --omit=dev
)

rm -f "$RUNTIME_STAGE/node_modules/.package-lock.json"
rm -f "$RUNTIME_STAGE/node_modules/opencode-ai/bin/.opencode"

cp package.json package-lock.json "$APP_OUT"/
cp -a dist "$APP_OUT"/
cp -a "$RUNTIME_STAGE/node_modules" "$APP_OUT"/
cp -a best_practices "$APP_OUT"/
printf '%s\n' "$TARGET" > "$PACKAGE_ROOT/TARGET"
printf '%s\n' "$(node -p "require('./package.json').version")" > "$PACKAGE_ROOT/VERSION"

if [[ "$TARGET_OS" == "windows" ]]; then
  cat > "$PACKAGE_ROOT/shrike.cmd" <<'EOF'
@echo off
setlocal
node "%~dp0app\dist\cli.js" %*
exit /b %ERRORLEVEL%
EOF

  cat > "$PACKAGE_ROOT/shrike.ps1" <<'EOF'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir 'app\dist\cli.js') @args
exit $LASTEXITCODE
EOF
else
  cat > "$PACKAGE_ROOT/shrike" <<'EOF'
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
  chmod +x "$PACKAGE_ROOT/shrike"
fi

mkdir -p "$FRAMEWORK_OUT"
cp -a "$PACKAGE_ROOT"/. "$FRAMEWORK_OUT"/

if [[ "$TARGET_OS" == "windows" ]]; then
  if command -v cygpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
    PACKAGE_ROOT_NATIVE="$(cygpath -w "$PACKAGE_ROOT")"
    ASSET_PATH_NATIVE="$(cygpath -w "$ASSET_PATH")"
    powershell.exe -NoProfile -NonInteractive -Command \
      "Compress-Archive -Path '$PACKAGE_ROOT_NATIVE' -DestinationPath '$ASSET_PATH_NATIVE' -Force"
  elif command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -NonInteractive -Command \
      "Compress-Archive -Path '$PACKAGE_ROOT' -DestinationPath '$ASSET_PATH' -Force"
  else
    echo "A PowerShell runtime is required to create Windows release archives." >&2
    exit 1
  fi
else
  tar -czf "$ASSET_PATH" -C "$OUTPUT_ROOT/package" "$APP"
fi

echo
echo "Publish complete."
echo "Framework output:      $FRAMEWORK_OUT"
echo "Release archive:       $ASSET_PATH"
