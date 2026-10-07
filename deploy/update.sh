#!/usr/bin/env bash
# Pulls the latest commit and copies site/ to the published folder if it changed.
set -euo pipefail
DIR="/opt/402scope-web"
. "$DIR/.target"
git config --global --add safe.directory "$DIR" 2>/dev/null || true
OLD="$(git -C "$DIR" rev-parse HEAD)"
git -C "$DIR" pull --ff-only -q
NEW="$(git -C "$DIR" rev-parse HEAD)"
if [ "$OLD" != "$NEW" ] || [ "${1:-}" = "--force" ]; then
  mkdir -p "$TARGET"
  # Copies files only; never deletes anything else in the folder.
  cp -a "$DIR/site/." "$TARGET/"
  echo "Published $(git -C "$DIR" log -1 --format='%h %s') to $TARGET"
else
  echo "Up to date ($(git -C "$DIR" log -1 --format=%h))."
fi
