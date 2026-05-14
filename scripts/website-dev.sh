#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_DIR="$SCRIPT_DIR/../website"

cd "$WEBSITE_DIR"

if ! command -v bundle &>/dev/null; then
  echo "Error: bundler not found. Install it with: gem install bundler" >&2
  exit 1
fi

if [ ! -f Gemfile.lock ]; then
  bundle install
fi

bundle exec jekyll serve --livereload
