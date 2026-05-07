#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/create-release.sh [patch|minor|major|<version>]

Defaults:
  patch

Behavior:
  - bumps package.json/package-lock.json version
  - stages all current changes
  - creates commit: chore(release): v<version>
  - creates annotated tag: v<version>

Examples:
  scripts/create-release.sh
  scripts/create-release.sh minor
  scripts/create-release.sh 0.3.0
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

VERSION_SPEC="${1:-patch}"

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v git >/dev/null 2>&1 || {
  echo "git is required." >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "npm is required." >&2
  exit 1
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "This command must be run inside a git repository." >&2
  exit 1
}

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "Detached HEAD is not supported for release preparation." >&2
  exit 1
fi

TARGET_VERSION="$(
  node - "$VERSION_SPEC" <<'NODE'
const fs = require('node:fs');

const spec = process.argv[2] ?? 'patch';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const current = pkg.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) {
  console.error(`Unsupported current version: ${current}`);
  process.exit(1);
}

const explicit = /^(\d+)\.(\d+)\.(\d+)$/.exec(spec);
if (explicit) {
  process.stdout.write(spec);
  process.exit(0);
}

let [major, minor, patch] = match.slice(1).map((value) => Number.parseInt(value, 10));

switch (spec) {
  case 'patch':
    patch += 1;
    break;
  case 'minor':
    minor += 1;
    patch = 0;
    break;
  case 'major':
    major += 1;
    minor = 0;
    patch = 0;
    break;
  default:
    console.error(`Unsupported version spec: ${spec}`);
    process.exit(1);
}

process.stdout.write(`${major}.${minor}.${patch}`);
NODE
)"

TAG_NAME="v${TARGET_VERSION}"
COMMIT_MESSAGE="chore(release): ${TAG_NAME}"

if git rev-parse -q --verify "refs/tags/${TAG_NAME}" >/dev/null 2>&1; then
  echo "Tag already exists: ${TAG_NAME}" >&2
  exit 1
fi

echo "Preparing release ${TAG_NAME} on branch ${CURRENT_BRANCH}"
echo "This will stage and commit all current changes in the repository."

npm version "$TARGET_VERSION" --no-git-tag-version

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit after version bump." >&2
  exit 1
fi

git commit -m "$COMMIT_MESSAGE"
git tag -a "$TAG_NAME" -m "Release ${TAG_NAME}"

echo
echo "Release prepared."
echo "Commit: ${COMMIT_MESSAGE}"
echo "Tag:    ${TAG_NAME}"
echo
echo "Next step:"
echo "  git push origin ${CURRENT_BRANCH} --follow-tags"
