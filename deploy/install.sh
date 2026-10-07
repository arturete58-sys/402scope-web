#!/usr/bin/env bash
# Publishes the 402scope.org front page from GitHub and keeps it updated.
# - Clones https://github.com/arturete58-sys/402scope-web to /opt/402scope-web
# - Copies site/ into the folder the observatory serves (its public/ folder)
# - Checks GitHub every 15 minutes and publishes new commits (systemd timer)
# - Prints a read-only diagnosis of the observatory API
# It never changes the API, the database or the web server configuration.
# Usage (as root):  bash install.sh        Optional: TARGET=/path/to/web/root bash install.sh
set -euo pipefail
REPO="https://github.com/arturete58-sys/402scope-web.git"
DIR="/opt/402scope-web"
say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mXX  %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Run as root."

say "Where the observatory serves its pages from"
if [ -z "${TARGET:-}" ]; then
  PID="$(ss -ltnpH 'sport = :3002' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
  if [ -n "$PID" ]; then
    OBS_DIR="$(readlink -f "/proc/$PID/cwd")"
    echo "API on :3002 is process $PID, running in $OBS_DIR"
  else
    OBS_DIR="$(dirname "$(find /root /opt /srv /home /var/www -maxdepth 4 -name api-server.js 2>/dev/null | head -1)" 2>/dev/null || true)"
    warn "Nothing listens on :3002 (the API is down). Using the folder of api-server.js: ${OBS_DIR:-not found}"
  fi
  [ -n "${OBS_DIR:-}" ] && [ -d "$OBS_DIR" ] || die "Could not find the observatory. Run again with TARGET=/path/to/web/root"
  TARGET="$OBS_DIR/public"
fi
echo "Pages will be published to: $TARGET"
echo "Web server lines that mention 402scope.org (for reference):"
grep -RIns "402scope.org" /etc/nginx /etc/caddy /etc/apache2 2>/dev/null | head -20 || true

say "Code"
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null; }
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only -q; else git clone -q "$REPO" "$DIR"; fi
echo "TARGET=\"$TARGET\"" > "$DIR/.target"

say "Backup of the current pages"
if [ -d "$TARGET" ] && [ ! -d /opt/402scope-web-backup ]; then cp -a "$TARGET" /opt/402scope-web-backup && echo "Saved to /opt/402scope-web-backup"; else echo "Backup already exists or nothing to back up."; fi

say "Publish"
bash "$DIR/deploy/update.sh" --force

say "Automatic updates every 15 minutes"
cat > /etc/systemd/system/402scope-web-update.service <<UNIT
[Unit]
Description=Publish the 402scope.org front page from GitHub
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $DIR/deploy/update.sh
UNIT
cat > /etc/systemd/system/402scope-web-update.timer <<UNIT
[Unit]
Description=Check GitHub for 402scope.org updates every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now 402scope-web-update.timer >/dev/null
echo "On. Turn off with: systemctl disable --now 402scope-web-update.timer"

bash "$DIR/deploy/diagnose.sh" || true
