#!/usr/bin/env bash
# Monthly "State of x402 delivery" report, generated on the server from the local API.
# - Adds one line to root's crontab: the 1st of each month at 06:05
# - Generates the first edition now
# Writes only under /var/www/402scope/reports and /var/www/402scope/feed.xml.
# Usage (as root):  bash /opt/402scope-web/deploy/install-reports.sh
set -euo pipefail
DIR="/opt/402scope-web"
. "$DIR/.target"
NODE="$(command -v node)"
LINE="5 6 1 * * $NODE $DIR/tools/report.mjs --out $TARGET >> /var/log/402scope-report.log 2>&1"
git -C "$DIR" pull --ff-only -q || true
if crontab -l 2>/dev/null | grep -q "tools/report.mjs"; then
  echo "Monthly report already scheduled."
else
  (crontab -l 2>/dev/null; echo "$LINE") | crontab -
  echo "Scheduled: the 1st of each month at 06:05."
fi
"$NODE" "$DIR/tools/report.mjs" --out "$TARGET"
echo "Open https://402scope.org/reports/ and https://402scope.org/feed.xml"
